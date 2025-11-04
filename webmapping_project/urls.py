from django.contrib import admin
from django.urls import path, include
from warhammer import views  

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", views.map_view, name="map"),
    path("api/", include("warhammer.urls")),
]
