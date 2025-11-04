import os
import json

from django.core.management.base import BaseCommand
from django.conf import settings
from django.db import connection


class Command(BaseCommand):
    help = "Load Irish counties from the OSi GeoJSON (EPSG:2157) straight into PostGIS and transform to 4326."

    def handle(self, *args, **options):
        # path to file 
        geojson_path = os.path.join(
            settings.BASE_DIR,
            "data",
            "Counties___OSi_National_Statutory_Boundaries_1239634581601351404.geojson",
        )

        if not os.path.exists(geojson_path):
            self.stderr.write(self.style.ERROR(f"File not found: {geojson_path}"))
            return

        # read the GeoJSON 
        with open(geojson_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        features = data.get("features", [])
        if not features:
            self.stderr.write(self.style.ERROR("No features in the GeoJSON."))
            return

        # clear table to prevent duplicates
        with connection.cursor() as cur:
            cur.execute("DELETE FROM warhammer_county;")

        inserted = 0

        # insert each feature using PostGIS to do the transform
        with connection.cursor() as cur:
            for feat in features:
                props = feat.get("properties", {})
                geom = feat.get("geometry")

                if not geom:
                    continue

                name = props.get("COUNTY") or props.get("ENGLISH") or "Unknown"
                province = (props.get("PROVINCE") or "").strip()

                geom_json = json.dumps(geom)

                cur.execute(
                    """
                    INSERT INTO warhammer_county (name, province, geom)
                    VALUES (
                        %s,
                        %s,
                        ST_Transform(
                            ST_SetSRID(
                                ST_GeomFromGeoJSON(%s),
                                2157
                            ),
                            4326
                        )
                    );
                    """,
                    [name, province, geom_json],
                )
                inserted += 1

        self.stdout.write(self.style.SUCCESS(f"Inserted {inserted} counties (2157 → 4326) via PostGIS."))
