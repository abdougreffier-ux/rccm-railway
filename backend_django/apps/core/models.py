"""
Core app – shared mixins and abstract models.
"""
from django.db import models
import uuid


class TimestampedModel(models.Model):
    """Abstract base class that provides created_at and updated_at fields."""
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class UUIDModel(models.Model):
    """Abstract base class that provides a UUID field."""
    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    class Meta:
        abstract = True
