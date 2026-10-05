# personalBudget

Application web Django de gestion de budget personnel (Orange Money), prévue pour tourner sur Termux.
Spécifications : [CLAUDE.md](CLAUDE.md) — plan de travail : [SPRINTS.md](SPRINTS.md).

## Installation (Windows, développement)

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python manage.py migrate
.\.venv\Scripts\python manage.py createsuperuser
.\.venv\Scripts\python manage.py runserver 0.0.0.0:8000
```

## Installation (Termux)

```sh
pkg update && pkg install python git
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 0.0.0.0:8000
```

Accès depuis le téléphone : http://127.0.0.1:8000 — depuis un autre appareil du réseau : http://IP_DU_TELEPHONE:8000.

## Configuration (variables d'environnement)

| Variable | Défaut | Rôle |
|---|---|---|
| `DJANGO_SECRET_KEY` | clé de dev | clé secrète (obligatoire en production) |
| `DJANGO_DEBUG` | `1` | `0` pour désactiver le mode debug |
| `DJANGO_ALLOWED_HOSTS` | `*` en debug, sinon `localhost` | hôtes autorisés, séparés par des virgules |

## Tests

```
python manage.py test
```
