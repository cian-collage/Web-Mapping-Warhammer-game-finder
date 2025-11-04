"""
Defines the spatial database models
Each model represents an entity used on the map:
- Venue: a location that can host games.
- GameSession: Warhammer session with spatial data and filters.
- County: Irish county boundaries for province-based filtering.
"""

from django.contrib.gis.db import models


#physical venue or game store where a game can be played
class Venue(models.Model):
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    location = models.PointField(srid=4326, null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["location"])]

    def __str__(self):
        return self.name


# Specific Warhammer game that players can join
class GameSession(models.Model):
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    game_system = models.CharField(
        max_length=100,
        default="Warhammer 40,000",
        help_text="e.g. 40k, AoS, Kill Team, Heresy"
    )
    points_level = models.CharField(
        max_length=50,
        blank=True,
        help_text="e.g. 1000pts, Combat Patrol, 2k, 750 narrative"
    )
    organiser = models.CharField(max_length=100)
    organiser_contact = models.CharField(max_length=100, blank=True)
    start_time = models.DateTimeField()
    max_players = models.PositiveIntegerField(default=2)
    current_players = models.PositiveIntegerField(default=1)

    # Spatial point
    location = models.PointField(srid=4326, null=True, blank=True)

    # can be set in a Venue (copies its location)
    venue = models.ForeignKey(
        "Venue",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="games"
    )

    is_open = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["start_time"]
        indexes = [
            models.Index(fields=["location"]),
            models.Index(fields=["venue"])
        ]

    # Automatically sets location to the venue’s if not defined
    def save(self, *args, **kwargs):
        if self.venue and self.venue.location and not self.location:
            self.location = self.venue.location
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title


# Stores county boundary polygons and provinces for spatial queries
class County(models.Model):
    name = models.CharField(max_length=100)
    province = models.CharField(max_length=50, blank=True, null=True)
    geom = models.MultiPolygonField(srid=4326)

    def __str__(self):
        return self.name
