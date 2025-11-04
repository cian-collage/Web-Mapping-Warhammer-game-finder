import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "webmapping_project.settings")

import django
django.setup()

from django.contrib.gis.geos import Point
from django.utils import timezone
from warhammer.models import Venue, GameSession

# Venues (name, lat, lng)
VENUES = [
    ("lower house",               53.352439487969924, -6.278248889568315),
    ("gamers world",              53.34688370233164,  -6.265873177175519),
    ("Wahammer shop",             53.34697868711576,  -6.263218134018802),
    ("Underworld Gaming",         53.2862,            -6.3739),
    ("The Warchest",              53.2941,            -6.1334),
    ("Warhammer Cork",            51.9023,            -8.4697),
    ("The Gathering Games Club",  52.6613,            -8.6305),
    ("Dungeons & Donuts",         53.2734,            -9.0493),
    ("EireHobbies",               54.0007,            -6.4031),
    ("Broadsword Wargaming",      53.3498,            -6.2615),
]

# Games (title, system, venue_name)
GAMES = [
    ("game test 1", "Warhammer 40,000", "lower house"),
    ("40k 1k pts – need 1", "Warhammer 40,000", "lower house"),
    ("test2", "Age of Sigmar", "gamers world"),
    ("test3", "Warhammer 40,000", "Wahammer shop"),
    ("test4", "Warhammer 40,000", "Wahammer shop"),
    ("test4", "Warhammer 40,000", "Wahammer shop"),
    ("test5", "Warhammer 40,000", "Wahammer shop"),
    ("Warcry at Underworld Gaming #6-4108", "Warcry", "Underworld Gaming"),
    ("Warhammer 40,000 at The Gathering Games Club #2-2526", "Warhammer 40,000", "The Gathering Games Club"),
    ("The Horus Heresy at EireHobbies #8-3010", "The Horus Heresy", "EireHobbies"),
    ("Kill Team at gamers world #4-6105", "Kill Team", "gamers world"),
    ("Warhammer 40,000 at Dungeons & Donuts #3-7175", "Warhammer 40,000", "Dungeons & Donuts"),
    ("Kill Team at Broadsword Wargaming #7-7482", "Kill Team", "Broadsword Wargaming"),
    ("Warhammer Age of Sigmar at Dungeons & Donuts #16-6202", "Age of Sigmar", "Dungeons & Donuts"),
    ("Warcry at Dungeons & Donuts #18-8914", "Warcry", "Dungeons & Donuts"),
    ("Kill Team at EireHobbies #5-5352", "Kill Team", "EireHobbies"),
    ("Necromunda at EireHobbies #10-5526", "Necromunda", "EireHobbies"),
    ("Warhammer 40,000 at Warhammer Cork #9-2146", "Warhammer 40,000", "Warhammer Cork"),
    ("Kill Team at Wahammer shop #17-5166", "Kill Team", "Wahammer shop"),
    ("Warhammer Age of Sigmar at gamers world #13-4206", "Age of Sigmar", "gamers world"),
    ("Warhammer 40,000 at Broadsword Wargaming #20-2030", "Warhammer 40,000", "Broadsword Wargaming"),
    ("Warcry at Underworld Gaming #15-6033", "Warcry", "Underworld Gaming"),
    ("Warhammer Age of Sigmar at Dungeons & Donuts #1-1699", "Age of Sigmar", "Dungeons & Donuts"),
    ("Necromunda at The Gathering Games Club #11-8512", "Necromunda", "The Gathering Games Club"),
    ("Warhammer Age of Sigmar at gamers world #14-6857", "Age of Sigmar", "gamers world"),
    ("Warhammer 40,000 at Warhammer Cork #12-6847", "Warhammer 40,000", "Warhammer Cork"),
    ("Warhammer 40,000 at lower house #19-2101", "Warhammer 40,000", "lower house"),
]

def main():
    # wipe current data 
    GameSession.objects.all().delete()
    Venue.objects.all().delete()

    # Create venues (by name)
    venue_by_name = {}
    for name, lat, lng in VENUES:
        v = Venue.objects.create(
            name=name,
            location=Point(lng, lat, srid=4326),
        )
        venue_by_name[name] = v

    # Create games
    created = 0
    for title, system, venue_name in GAMES:
        v = venue_by_name.get(venue_name)
        if not v:
            print(f"!! Skipping '{title}' — venue '{venue_name}' not found")
            continue

        kwargs = {"title": title, "venue": v}

        if hasattr(GameSession, "game_system"):
            kwargs["game_system"] = system
        if hasattr(GameSession, "is_open"):
            kwargs["is_open"] = True
        if hasattr(GameSession, "start_time"):
            kwargs["start_time"] = timezone.now()

        GameSession.objects.create(**kwargs)
        created += 1

    print(f"✅ Seeded {len(venue_by_name)} venues and {created} game sessions.")

if __name__ == "__main__":
    main()
