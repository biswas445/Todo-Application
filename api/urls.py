"""
URL configuration for the API app.
Defines REST API routes using Django REST Framework routers.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    AuthViewSet, UserViewSet,
    ListViewSet, TagViewSet, TaskViewSet,
    NoteViewSet, CalendarEventViewSet
)

# Create a router and register our viewsets
router = DefaultRouter()

# Authentication endpoints
router.register(r'auth', AuthViewSet, basename='auth')

# User profile endpoints
router.register(r'user', UserViewSet, basename='user')

# Data endpoints
router.register(r'lists', ListViewSet)
router.register(r'tags', TagViewSet)
router.register(r'tasks', TaskViewSet)
router.register(r'notes', NoteViewSet)
router.register(r'events', CalendarEventViewSet)

# URL patterns
urlpatterns = [
    path('', include(router.urls)),
]
