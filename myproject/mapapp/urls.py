from django.urls import path
from . import views
from . import auth_views

urlpatterns = [
    path('', views.map_page, name='map_page'),
    path('map-data/', views.map_data, name='map_data'),
    path('user-wells/', views.user_wells_data, name='user_wells_data'),
    path('login/', auth_views.login, name='login'),
    path('logout/', auth_views.logout, name='logout'),
    path('callback/', auth_views.callback, name='callback'),
    path('user-wells-data/', views.user_wells_data, name='user_wells_data'),
    path('bulk-production/', views.bulk_well_production, name='bulk_well_production'),
    path('price-decks/', views.price_decks, name='price_decks'),
    path('econ-data/', views.economics_data, name='economics_data'),
    path('feedback/', views.user_feedback_entries, name='user_feedback_entries'),
]