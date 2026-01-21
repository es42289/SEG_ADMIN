from django.urls import path
from . import views
from . import auth_views
from .upload_views import (
    StartUpload,
    FinalizeUpload,
    ListMyFiles,
    FileDetail,
    OpenFile,
)

urlpatterns = [
    path('', views.map_page, name='map_page'),
    path('well-explorer/', views.well_explorer_page, name='well_explorer_page'),
    path('well-explorer/data/', views.well_explorer_data, name='well_explorer_data'),
    path('well-explorer/wells-data/', views.well_explorer_wells_data, name='well_explorer_wells_data'),
    path('map-data/', views.map_data, name='map_data'),
    path('user-wells/', views.user_wells_data, name='user_wells_data'),
    path('login/', auth_views.login, name='login'),
    path('logout/', auth_views.logout, name='logout'),
    path('callback/', auth_views.callback, name='callback'),
    path('user-wells-data/', views.user_wells_data, name='user_wells_data'),
    path('bulk-production/', views.bulk_well_production, name='bulk_well_production'),
    path('well-dca-inputs/', views.well_dca_inputs, name='well_dca_inputs'),
    path('well-dca-inputs/save/', views.save_well_dca_inputs, name='save_well_dca_inputs'),
    path('well-dca-inputs/export/', views.export_well_dca_inputs, name='export_well_dca_inputs'),
    path('price-decks/', views.price_decks, name='price_decks'),
    path('econ-data/', views.economics_data, name='economics_data'),
    path('feedback/', views.user_feedback_entries, name='user_feedback_entries'),
    path('api/user-info/', views.user_info, name='user_info'),
    path('impersonate/select-user/', views.admin_select_user, name='admin_select_user'),
    path('api/uploads/start', StartUpload.as_view(), name='start_upload'),
    path('api/uploads/finalize', FinalizeUpload.as_view(), name='finalize_upload'),
    path('api/files', ListMyFiles.as_view(), name='list_files'),
    path('api/files/<uuid:file_id>', FileDetail.as_view(), name='file_detail'),
    path('api/files/<uuid:file_id>/open', OpenFile.as_view(), name='open_file'),
]
