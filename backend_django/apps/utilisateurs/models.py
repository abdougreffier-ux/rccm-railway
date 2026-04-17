import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin


class Role(models.Model):
    code        = models.CharField(max_length=30, unique=True)
    libelle     = models.CharField(max_length=100)
    libelle_ar  = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    actif       = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table   = 'roles'
        verbose_name        = 'Rôle'
        verbose_name_plural = 'Rôles'

    def __str__(self): return self.libelle


class Permission(models.Model):
    code       = models.CharField(max_length=50, unique=True)
    libelle    = models.CharField(max_length=100)
    module     = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table   = 'permissions_rc'
        verbose_name        = 'Permission RC'
        verbose_name_plural = 'Permissions RC'

    def __str__(self): return self.code


class RolePermission(models.Model):
    role       = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='role_permissions')
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE)

    class Meta:
        db_table = 'roles_permissions'
        unique_together = ('role', 'permission')


class Poste(models.Model):
    code       = models.CharField(max_length=30, unique=True)
    libelle_fr = models.CharField(max_length=150)
    libelle_ar = models.CharField(max_length=150, blank=True)
    actif      = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table   = 'postes'
        verbose_name        = 'Poste'
        verbose_name_plural = 'Postes'

    def __str__(self): return self.libelle_fr


class UtilisateurManager(BaseUserManager):
    def create_user(self, login, password=None, **extra):
        if not login:
            raise ValueError('Le login est obligatoire')
        user = self.model(login=login, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, login, password=None, **extra):
        extra.setdefault('is_staff', True)
        extra.setdefault('is_superuser', True)
        return self.create_user(login, password, **extra)


class Utilisateur(AbstractBaseUser, PermissionsMixin):
    uuid          = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    matricule     = models.CharField(max_length=30, unique=True, null=True, blank=True)
    nom           = models.CharField(max_length=100)
    prenom        = models.CharField(max_length=100, blank=True)
    login         = models.CharField(max_length=50, unique=True)
    email         = models.EmailField(unique=True, null=True, blank=True)
    telephone     = models.CharField(max_length=20, blank=True)
    role          = models.ForeignKey(Role,    null=True, blank=True, on_delete=models.SET_NULL, related_name='utilisateurs')
    poste         = models.ForeignKey(Poste,   null=True, blank=True, on_delete=models.SET_NULL, related_name='utilisateurs')
    localite      = models.ForeignKey('parametrage.Localite', null=True, blank=True, on_delete=models.SET_NULL)
    actif         = models.BooleanField(default=True)
    derniere_cnx  = models.DateTimeField(null=True, blank=True)
    is_staff      = models.BooleanField(default=False)
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    USERNAME_FIELD  = 'login'
    REQUIRED_FIELDS = ['nom']

    objects = UtilisateurManager()

    class Meta:
        db_table   = 'utilisateurs'
        verbose_name        = 'Utilisateur'
        verbose_name_plural = 'Utilisateurs'

    def __str__(self): return f'{self.nom} {self.prenom} ({self.login})'

    def get_full_name(self): return f'{self.nom} {self.prenom}'.strip()

    @property
    def role_code(self):
        return self.role.code if self.role else None
