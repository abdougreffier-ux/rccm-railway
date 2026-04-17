"""
Management command : update_be_status
======================================
Parcourt tous les RA en statut EN_ATTENTE dont la date_limite_be
est dépassée et les passe en EN_RETARD.

Utilisation :
  python manage.py update_be_status
  python manage.py update_be_status --dry-run   (simulation sans écriture)

Planification recommandée (cron) :
  0 1 * * * /path/to/venv/bin/python manage.py update_be_status >> /var/log/be_cron.log 2>&1
"""
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = (
        'Met à jour le statut BE des RA en EN_ATTENTE '
        'dont la date limite est dépassée → EN_RETARD.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Affiche les RA concernés sans les modifier.',
        )

    def handle(self, *args, **options):
        from apps.registres.models import RegistreAnalytique

        today    = timezone.now().date()
        dry_run  = options['dry_run']

        qs = RegistreAnalytique.objects.filter(
            statut_be='EN_ATTENTE',
            date_limite_be__lt=today,
        )

        count = qs.count()
        if count == 0:
            self.stdout.write(self.style.SUCCESS('Aucun RA à mettre à jour.'))
            return

        self.stdout.write(f'{count} RA à passer en EN_RETARD (date limite dépassée).')

        if dry_run:
            for ra in qs.values_list('numero_ra', 'date_limite_be'):
                self.stdout.write(f'  [DRY-RUN] RA {ra[0]} — limite : {ra[1]}')
            self.stdout.write(self.style.WARNING('Dry-run : aucune modification effectuée.'))
            return

        updated = qs.update(statut_be='EN_RETARD')
        self.stdout.write(
            self.style.SUCCESS(f'{updated} RA passés en EN_RETARD avec succès.')
        )
