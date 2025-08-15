from django.urls import path
from . import views

urlpatterns = [
    path("map/", views.map_page, name="map_page"),
    path("map-data/", views.map_data, name="map_data"),
]
