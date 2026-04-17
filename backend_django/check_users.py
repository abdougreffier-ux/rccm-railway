import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'registre_rc.settings')

import django
django.setup()

from django.contrib.auth import get_user_model
U = get_user_model()
users = U.objects.all()

out = []
out.append(f"Total users: {users.count()}")
for u in users:
    out.append(f"  - {u.username} | active={u.is_active} | superuser={u.is_superuser}")

if users.count() == 0:
    out.append("Aucun utilisateur. Creation admin/admin...")
    U.objects.create_superuser(username='admin', password='admin', email='admin@rccm.mr')
    out.append("OK: superuser admin cree")

result = '\n'.join(out)
print(result)
with open('check_users_output.txt', 'w') as f:
    f.write(result)
