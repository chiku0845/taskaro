import os
from django.contrib import admin
from django.urls import path, include, re_path
from django.http import FileResponse, Http404
from django.conf import settings

def serve_index(request):
    index_path = settings.BASE_DIR / 'public' / 'index.html'
    if os.path.exists(index_path):
        return FileResponse(open(index_path, 'rb'), content_type='text/html')
    raise Http404("Index not found")

def serve_demo(request):
    demo_path = settings.BASE_DIR / 'public' / 'demo.html'
    if os.path.exists(demo_path):
        return FileResponse(open(demo_path, 'rb'), content_type='text/html')
    raise Http404("Demo not found")

def serve_public_file(request, filename):
    file_path = settings.BASE_DIR / 'public' / filename
    if os.path.exists(file_path):
        content_type = 'text/plain'
        if filename.endswith('.css'): content_type = 'text/css'
        elif filename.endswith('.js'): content_type = 'application/javascript'
        elif filename.endswith('.png'): content_type = 'image/png'
        elif filename.endswith('.svg'): content_type = 'image/svg+xml'
        elif filename.endswith('.ico'): content_type = 'image/x-icon'
        elif filename.endswith('.html'): content_type = 'text/html'
        return FileResponse(open(file_path, 'rb'), content_type=content_type)
    raise Http404("File not found")

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    path('', serve_index, name='index'),
    path('demo.html', serve_demo, name='demo'),
    re_path(r'^(?P<filename>[^/]+\.(?:css|js|png|svg|ico|jpg|jpeg|gif|json))$', serve_public_file, name='public_files'),
]
