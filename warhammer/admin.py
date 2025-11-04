"""
Configures how the Warhammer Game Finder models appear
and behave in the Django admin interface.
"""

from django.contrib import admin
from django.contrib.gis.admin import OSMGeoAdmin
from .models import Venue, GameSession

# Venue Admin
@admin.register(Venue)
class VenueAdmin(OSMGeoAdmin):
    list_display = ("name", "location")
    search_fields = ("name",)
    default_lon = -6.2603
    default_lat = 53.3498
    default_zoom = 12

# Game Session Admin
@admin.register(GameSession)
class GameSessionAdmin(OSMGeoAdmin):
    list_display = ("title", "game_system", "start_time", "is_open", "venue")
    list_filter = ("game_system", "is_open", "venue")
    search_fields = ("title", "description", "organiser")
    default_lon = -6.2603
    default_lat = 53.3498
    default_zoom = 12

    def save_model(self, request, obj, form, change):
        if obj.venue and obj.venue.location:
            obj.location = obj.venue.location
        super().save_model(request, obj, form, change)
