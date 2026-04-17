from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.core'

    def ready(self):
        # Créer le dossier logs/ si absent (RotatingFileHandler en a besoin)
        self._ensure_logs_dir()

        # Enregistrer les system checks personnalisés RCCM
        import apps.core.checks  # noqa: F401  (registration via @register)

        # Vérifier la cohérence schéma/modèles au démarrage
        from apps.core.startup import check_migrations_on_startup
        check_migrations_on_startup()

    @staticmethod
    def _ensure_logs_dir():
        try:
            from django.conf import settings
            logs_dir = settings.BASE_DIR / 'logs'
            logs_dir.mkdir(exist_ok=True)
        except Exception:
            pass  # non bloquant
