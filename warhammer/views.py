"""
Handles API endpoints and view logic
Includes REST views for sessions and venues, GeoJSON responses for the map,
and spatial queries using PostGIS functions (bbox, nearest, province filter).
"""

from django.shortcuts import render
from django.http import JsonResponse
from django.db import models
from django.contrib.gis.geos import Point, Polygon
from django.contrib.gis.db.models.functions import Distance
from django.views.decorators.csrf import csrf_exempt

from rest_framework import generics, status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response

from rest_framework_gis.serializers import GeoFeatureModelSerializer

from .models import GameSession, Venue, County
from .serializers import GameSessionSerializer, VenueSerializer


# Serializes County polygons as GeoJSON features to be used for province filters
class CountySerializer(GeoFeatureModelSerializer):
    class Meta:
        model = County
        geo_field = "geom"
        fields = ("id", "name", "province")


# Renders the main map page
def map_view(request):
    return render(request, "warhammer/map.html")


# List and create GameSession records through the API
class GameSessionListCreateView(generics.ListCreateAPIView):
    queryset = GameSession.objects.select_related("venue").all().order_by("start_time")
    serializer_class = GameSessionSerializer


# CRUD

# Retrieve, update, or delete a specific GameSession
class GameSessionDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = GameSession.objects.select_related("venue").all()
    serializer_class = GameSessionSerializer

# List and create Venues through the API
class VenueListCreateView(generics.ListCreateAPIView):
    queryset = Venue.objects.all().order_by("name")
    serializer_class = VenueSerializer

# Retrieve, update, or delete a specific Venue
class VenueDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Venue.objects.all()
    serializer_class = VenueSerializer


# Converts a query of sessions into a GeoJSON FeatureCollection
def session_queryset_to_geojson(qs, include_distance: bool = False):
    features = []
    for s in qs:
        lng = lat = None
        if s.location:
            lng = s.location.x
            lat = s.location.y
        elif s.venue and s.venue.location:
            lng = s.venue.location.x
            lat = s.venue.location.y
        else:
            continue

        props = {
            "id": s.id,
            "title": s.title,
            "description": s.description,
            "game_system": s.game_system,
            "points_level": s.points_level,
            "is_open": s.is_open,
            "start_time": s.start_time,
            "organiser": s.organiser,
            "organiser_contact": s.organiser_contact,
            "current_players": s.current_players,
            "max_players": s.max_players,
        }

        if s.venue:
            props["venue_name"] = s.venue.name
        if include_distance and hasattr(s, "distance") and s.distance is not None:
            props["distance_m"] = round(s.distance.m, 2)

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": props,
        })
    return {"type": "FeatureCollection", "features": features}


# Filters sessions based on province, matching points to County polygons
def _filter_sessions_by_province(qs, province_name: str):
    if not province_name:
        return qs
    province_name = province_name.strip()
    counties = County.objects.filter(province__iexact=province_name)
    if not counties.exists():
        return qs
    province_q = models.Q()
    for c in counties:
        province_q |= (
            models.Q(location__within=c.geom)
            | models.Q(location__coveredby=c.geom)
            | models.Q(location__intersects=c.geom)
            | models.Q(venue__location__within=c.geom)
            | models.Q(venue__location__coveredby=c.geom)
            | models.Q(venue__location__intersects=c.geom)
        )
    return qs.filter(province_q)


# Returns sessions as GeoJSON, with text and filter support
@api_view(["GET"])
def sessions_geojson(request):
    q = request.GET.get("q", "").strip()
    system = request.GET.get("system", "").strip()
    open_only = request.GET.get("open", "").strip()
    province = request.GET.get("province", "").strip()

    qs = GameSession.objects.select_related("venue").all()
    if q:
        qs = qs.filter(
            models.Q(title__icontains=q)
            | models.Q(description__icontains=q)
            | models.Q(game_system__icontains=q)
            | models.Q(venue__name__icontains=q)
        )
    if system:
        qs = qs.filter(game_system=system)
    if open_only:
        qs = qs.filter(is_open=True)
    qs = _filter_sessions_by_province(qs, province)
    return JsonResponse(session_queryset_to_geojson(qs))


# Returns all venues as GeoJSON point features
@api_view(["GET"])
def venues_geojson(request):
    venues = Venue.objects.all()
    features = []
    for v in venues:
        if not v.location:
            continue
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [v.location.x, v.location.y]},
            "properties": {"id": v.id, "name": v.name},
        })
    return JsonResponse({"type": "FeatureCollection", "features": features})


# Simple search view
@api_view(["GET"])
def sessions_search(request):
    q = request.GET.get("q", "").strip()
    qs = GameSession.objects.all()
    if q:
        qs = qs.filter(
            models.Q(title__icontains=q)
            | models.Q(description__icontains=q)
            | models.Q(game_system__icontains=q)
        )
    data = [GameSessionSerializer(s).data for s in qs]
    return JsonResponse(data, safe=False)


# Spatial query: 
# sessions within the visible map bounding box
@api_view(["GET"])
def sessions_in_bbox(request):
    try:
        west = float(request.GET.get("west"))
        south = float(request.GET.get("south"))
        east = float(request.GET.get("east"))
        north = float(request.GET.get("north"))
    except (TypeError, ValueError):
        return Response(
            {"error": "west, south, east, north are required as floats"},
            status=status.HTTP_400_BAD_REQUEST
        )

    system = request.GET.get("system", "").strip()
    open_only = request.GET.get("open", "").strip()
    province = request.GET.get("province", "").strip()

    bbox = Polygon.from_bbox((west, south, east, north))
    bbox.srid = 4326

    qs = (
        GameSession.objects.select_related("venue")
        .filter(models.Q(location__within=bbox) | models.Q(venue__location__within=bbox))
        .distinct()
    )
    if system:
        qs = qs.filter(game_system=system)
    if open_only:
        qs = qs.filter(is_open=True)
    qs = _filter_sessions_by_province(qs, province)
    return JsonResponse(session_queryset_to_geojson(qs))


# Spatial query: 
# nearest sessions to a given coordinate
@csrf_exempt
@api_view(["POST"])
@authentication_classes([])
@permission_classes([])
def sessions_nearest(request):
    try:
        lat = float(request.data.get("lat"))
        lng = float(request.data.get("lng"))
    except (TypeError, ValueError):
        return Response(
            {"error": "lat and lng are required and must be numbers"},
            status=status.HTTP_400_BAD_REQUEST
        )

    limit_raw = request.data.get("limit", 10)
    try:
        limit = int(limit_raw)
    except (TypeError, ValueError):
        limit = 10

    system = (request.data.get("system") or "").strip()
    open_only = (str(request.data.get("open") or "")).strip()
    province = (request.data.get("province") or "").strip()

    user_point = Point(lng, lat, srid=4326)
    qs = GameSession.objects.filter(location__isnull=False).annotate(
        distance=Distance("location", user_point)
    ).order_by("distance")

    if system:
        qs = qs.filter(game_system=system)
    if open_only:
        qs = qs.filter(is_open=True)
    qs = _filter_sessions_by_province(qs, province)[:limit]

    geojson = session_queryset_to_geojson(qs, include_distance=True)
    geojson["search_point"] = {"lat": lat, "lng": lng}
    return Response(geojson)


# Returns a list of all game systems for the filter dropdown
@api_view(["GET"])
def sessions_distinct_systems(request):
    systems = (
        GameSession.objects.exclude(game_system__isnull=True)
        .exclude(game_system__exact="")
        .values_list("game_system", flat=True)
        .distinct()
    )
    return Response(sorted(systems))


# Returns the county covering a given point
@api_view(["GET"])
def county_for_point(request):
    lat = request.GET.get("lat")
    lng = request.GET.get("lng")
    if not lat or not lng:
        return Response({"error": "lat and lng are required"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        lat = float(lat)
        lng = float(lng)
    except ValueError:
        return Response({"error": "lat and lng must be numbers"}, status=status.HTTP_400_BAD_REQUEST)
    pt = Point(lng, lat, srid=4326)
    county = County.objects.filter(geom__covers=pt).first()
    if not county:
        county = County.objects.filter(geom__intersects=pt).first()
    if not county:
        return Response({"error": "No county found"}, status=status.HTTP_404_NOT_FOUND)
    return Response(CountySerializer(county).data)


# Returns all unique provinces for the filter dropdown
@api_view(["GET"])
def distinct_provinces(request):
    qs = (
        County.objects.exclude(province__isnull=True)
        .exclude(province__exact="")
        .order_by("province")
        .values_list("province", flat=True)
        .distinct()
    )
    return Response(list(qs))
