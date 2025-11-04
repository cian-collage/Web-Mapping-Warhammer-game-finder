"""
Maps all API and page endpoints for the Warhammer Game Finder app.
"""

from django.urls import path
from warhammer import views

urlpatterns = [
    path("", views.map_view, name="map"),
    path("sessions/", views.GameSessionListCreateView.as_view(), name="session-list"),
    path("sessions/<int:pk>/", views.GameSessionDetailView.as_view(), name="session-detail"),
    path("venues/", views.VenueListCreateView.as_view(), name="venue-list"),
    path("venues/<int:pk>/", views.VenueDetailView.as_view(), name="venue-detail"),
    path("sessions/geojson/", views.sessions_geojson, name="sessions-geojson"),
    path("sessions/in-bbox/", views.sessions_in_bbox, name="sessions-in-bbox"),
    path("sessions/nearest/", views.sessions_nearest, name="sessions-nearest"),
    path("sessions/distinct-systems/", views.sessions_distinct_systems, name="sessions-distinct-systems"),
    path("venues/geojson/", views.venues_geojson, name="venues-geojson"),
    path("counties/for-point/", views.county_for_point, name="county-for-point"),
    path("counties/distinct-provinces/", views.distinct_provinces, name="counties-distinct-provinces"),
]
