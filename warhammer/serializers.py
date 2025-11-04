"""
Defines how model data is converted to and from JSON for the REST API.
"""

from rest_framework import serializers
from .models import GameSession, Venue


# Serializes Venue data for API
class VenueSerializer(serializers.ModelSerializer):
    class Meta:
        model = Venue
        fields = ["id", "name", "description", "location"]


# Serializes GameSession data with venue information
class GameSessionSerializer(serializers.ModelSerializer):
    # Read-only nested venue
    venue = VenueSerializer(read_only=True)

    # Allows assigning an existing venue by ID 
    venue_id = serializers.PrimaryKeyRelatedField(
        queryset=Venue.objects.all(),
        source="venue",
        write_only=True,
        required=False
    )

    class Meta:
        model = GameSession
        fields = [
            "id",
            "title",
            "description",
            "game_system",
            "points_level",
            "organiser",
            "organiser_contact",
            "start_time",
            "max_players",
            "current_players",
            "is_open",
            "location",
            "venue",
            "venue_id",
            "created_at",
        ]
