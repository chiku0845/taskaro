web: python manage.py migrate && gunicorn taskaro_core.wsgi:application --bind 0.0.0.0:${PORT:-8000}
