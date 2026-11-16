import math
import secrets
from datetime import datetime, timezone
import requests
from django.db import models
from django.utils import timezone as dj_timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from .models import (
    UserAccount, Team, TeamMember, Project, Task,
    Routine, RoutineLog, Plan, PlanMilestone, Note,
    Schedule, Message, Notification, ActivityLog
)
from .serializers import (
    UserAccountSerializer, TeamSerializer, ProjectSerializer, TaskSerializer,
    RoutineSerializer, PlanSerializer, NoteSerializer, ScheduleSerializer,
    MessageSerializer, NotificationSerializer, ActivityLogSerializer
)
from .authentication import (
    hash_password, verify_password, generate_auth_token,
    get_user_from_token, send_email_otp, verify_email_otp
)

def log_activity(actor_id, actor_name, action, entity_type, entity_id, details):
    try:
        ActivityLog.objects.create(
            log_id='log_' + secrets.token_hex(6),
            actor_id=actor_id,
            actor_name=actor_name,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details
        )
    except Exception as e:
        print('Error logging activity:', e)

def get_auth_user(request):
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return None
    parts = auth_header.split()
    if len(parts) == 2 and parts[0].lower() == 'bearer':
        return get_user_from_token(parts[1])
    return None

def seed_defaults():
    # Clean slate requested by user: No dummy admin, dummy users, or sample tasks seeded.
    # Users and admins register cleanly through the Sign Up portal.
    pass

# ----------------------------------------------------
# AUTHENTICATION VIEWS
# ----------------------------------------------------

class SignupView(APIView):
    def post(self, request):
        seed_defaults()
        data = request.data
        name = data.get('name', '').strip()
        age = int(data.get('age', 20))
        gender = data.get('gender', 'Unspecified')
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        role = data.get('role', 'user')

        if not name or not email or not password:
            return Response({'error': 'Name, email, and password are required'}, status=status.HTTP_400_BAD_REQUEST)

        if len(password) < 6:
            return Response({'error': 'Password must be at least 6 characters'}, status=status.HTTP_400_BAD_REQUEST)

        if UserAccount.objects.filter(email=email).exists():
            return Response({'error': 'An account with this email already exists'}, status=status.HTTP_400_BAD_REQUEST)

        user_id = 'user_' + secrets.token_hex(6)
        pwd_hash, pwd_salt = hash_password(password)

        user = UserAccount.objects.create(
            user_id=user_id,
            name=name,
            age=age,
            gender=gender,
            email=email,
            password_hash=pwd_hash,
            password_salt=pwd_salt,
            role=role if role in ('user', 'admin') else 'user',
            account_status='active',
            avatar_color='#2563eb'
        )

        token = generate_auth_token(user)
        log_activity(user.user_id, user.name, 'USER_SIGNUP', 'User', user.user_id, f"User registered: {user.name} ({user.email})")

        return Response({
            'message': 'Account created successfully',
            'token': token,
            'user': UserAccountSerializer(user).data
        }, status=status.HTTP_201_CREATED)

class LoginView(APIView):
    def post(self, request):
        seed_defaults()
        data = request.data
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        portal_role = data.get('portalRole', 'user')

        if not email or not password:
            return Response({'error': 'Email and password are required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = UserAccount.objects.get(email=email)
        except UserAccount.DoesNotExist:
            return Response({'error': 'Invalid email or password'}, status=status.HTTP_401_UNAUTHORIZED)

        if not verify_password(password, user.password_hash, user.password_salt):
            return Response({'error': 'Invalid email or password'}, status=status.HTTP_401_UNAUTHORIZED)

        if user.account_status != 'active':
            return Response({'error': 'Your account has been deactivated. Please contact an administrator.'}, status=status.HTTP_403_FORBIDDEN)

        # STRICT DUAL-PORTAL SEPARATION
        if portal_role == 'admin' and user.role != 'admin':
            return Response({'error': 'Access denied: You do not have administrator permissions for Admin Portal.'}, status=status.HTTP_403_FORBIDDEN)
        if portal_role == 'user' and user.role != 'user':
            return Response({'error': 'Access denied: This is an Administrator account. Please use Admin Login.'}, status=status.HTTP_403_FORBIDDEN)

        user.last_login = dj_timezone.now()
        user.save(update_fields=['last_login'])

        token = generate_auth_token(user)
        log_activity(user.user_id, user.name, 'USER_LOGIN', 'User', user.user_id, f"User logged in from {portal_role} portal")

        return Response({
            'message': 'Login successful',
            'token': token,
            'user': UserAccountSerializer(user).data
        })

class MeView(APIView):
    def get(self, request):
        user = get_auth_user(request)
        if not user:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
        return Response({'user': UserAccountSerializer(user).data})

class ProfileUpdateView(APIView):
    def put(self, request):
        user = get_auth_user(request)
        if not user:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

        data = request.data
        if 'name' in data and data['name'].strip():
            user.name = data['name'].strip()
        if 'age' in data:
            user.age = int(data['age'])
        if 'gender' in data:
            user.gender = data['gender']
        if 'avatar_color' in data:
            user.avatar_color = data['avatar_color']

        user.save()
        log_activity(user.user_id, user.name, 'UPDATE_PROFILE', 'User', user.user_id, f"Updated profile details")
        return Response({'message': 'Profile updated successfully', 'user': UserAccountSerializer(user).data})

class ChangePasswordView(APIView):
    def put(self, request):
        user = get_auth_user(request)
        if not user:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

        current = request.data.get('currentPassword', '')
        new_pwd = request.data.get('newPassword', '')

        if not verify_password(current, user.password_hash, user.password_salt):
            return Response({'error': 'Current password is incorrect'}, status=status.HTTP_400_BAD_REQUEST)

        if len(new_pwd) < 6:
            return Response({'error': 'New password must be at least 6 characters'}, status=status.HTTP_400_BAD_REQUEST)

        h, s = hash_password(new_pwd)
        user.password_hash = h
        user.password_salt = s
        user.save(update_fields=['password_hash', 'password_salt'])

        log_activity(user.user_id, user.name, 'CHANGE_PASSWORD', 'User', user.user_id, "Password changed successfully")
        return Response({'message': 'Password changed successfully'})

class SendOtpView(APIView):
    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        if not email:
            return Response({'error': 'Email is required'}, status=status.HTTP_400_BAD_REQUEST)
        ok, msg = send_email_otp(email)
        if ok:
            return Response({'message': 'Verification code sent to your email'})
        return Response({'error': msg}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class VerifyOtpView(APIView):
    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        otp = request.data.get('otp', '').strip()
        if not email or not otp:
            return Response({'error': 'Email and OTP are required'}, status=status.HTTP_400_BAD_REQUEST)
        ok, msg = verify_email_otp(email, otp)
        if ok:
            return Response({'message': msg})
        return Response({'error': msg}, status=status.HTTP_400_BAD_REQUEST)

class GoogleOAuthView(APIView):
    def post(self, request):
        token = request.data.get('id_token') or request.data.get('credential')
        if not token:
            return Response({'error': 'Google token is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            resp = requests.get(f'https://oauth2.googleapis.com/tokeninfo?id_token={token}', timeout=5)
            if resp.status_code != 200:
                return Response({'error': 'Invalid Google token'}, status=status.HTTP_401_UNAUTHORIZED)
            gdata = resp.json()
            email = gdata.get('email', '').lower()
            name = gdata.get('name', email.split('@')[0])

            user, created = UserAccount.objects.get_or_create(
                email=email,
                defaults={
                    'user_id': 'user_' + secrets.token_hex(6),
                    'name': name,
                    'age': 20,
                    'gender': 'Unspecified',
                    'password_hash': 'oauth_google',
                    'password_salt': 'oauth_google',
                    'role': 'user',
                    'account_status': 'active',
                    'avatar_color': '#3b82f6'
                }
            )

            auth_token = generate_auth_token(user)
            return Response({
                'message': 'Google authentication successful',
                'token': auth_token,
                'user': UserAccountSerializer(user).data
            })
        except Exception as e:
            return Response({'error': f'Google authentication failed: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# ----------------------------------------------------
# DASHBOARD STATS VIEW
# ----------------------------------------------------

class DashboardStatsView(APIView):
    def get(self, request):
        seed_defaults()
        user = get_auth_user(request)
        if not user:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

        is_admin = user.role == 'admin'

        if is_admin:
            tasks = Task.objects.all()
            total = tasks.count()
            completed = tasks.filter(status='Completed').count()
            in_prog = tasks.filter(status='In Progress').count()
            pending = tasks.filter(status='Pending').count()
            blocked = tasks.filter(status='Blocked').count()

            rate = round((completed / total) * 100) if total > 0 else 0
            users_count = UserAccount.objects.count()
            active_users = UserAccount.objects.filter(account_status='active').count()

            return Response({
                'role': 'admin',
                'totalTasks': total,
                'completed': completed,
                'inProgress': in_prog,
                'pending': pending,
                'blocked': blocked,
                'overdue': 0,
                'completionRate': rate,
                'totalUsers': users_count,
                'activeUsers': active_users
            })
        else:
            team_ids = TeamMember.objects.filter(user_id=user.user_id).values_list('team_id', flat=True)
            tasks = Task.objects.filter(
                models.Q(assignee_id=user.user_id) |
                models.Q(creator_id=user.user_id) |
                models.Q(team_id__in=team_ids)
            ).distinct()

            total = tasks.count()
            completed = tasks.filter(status='Completed').count()
            in_prog = tasks.filter(status='In Progress').count()
            pending = tasks.filter(status='Pending').count()
            blocked = tasks.filter(status='Blocked').count()
            rate = round((completed / total) * 100) if total > 0 else 0

            return Response({
                'role': 'user',
                'totalTasks': total,
                'completed': completed,
                'inProgress': in_prog,
                'pending': pending,
                'blocked': blocked,
                'overdue': 0,
                'completionRate': rate
            })

# ----------------------------------------------------
# TASKS VIEW
# ----------------------------------------------------

class TaskListView(APIView):
    def get(self, request):
        seed_defaults()
        user = get_auth_user(request)
        if not user:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

        is_admin = user.role == 'admin'
        if is_admin:
            qs = Task.objects.all().order_by('-created_at')
        else:
            team_ids = TeamMember.objects.filter(user_id=user.user_id).values_list('team_id', flat=True)
            qs = Task.objects.filter(
                models.Q(assignee_id=user.user_id) |
                models.Q(creator_id=user.user_id) |
                models.Q(team_id__in=team_ids)
            ).distinct().order_by('-created_at')

        task_list = list(qs)
        user_ids = {t.assignee_id for t in task_list if t.assignee_id} | {t.creator_id for t in task_list if t.creator_id}
        prereq_ids = {t.prerequisite_task_id for t in task_list if t.prerequisite_task_id}
        team_ids_set = {t.team_id for t in task_list if t.team_id}
        project_ids = {t.project_id for t in task_list if t.project_id}

        users_map = {u.user_id: u for u in UserAccount.objects.filter(user_id__in=user_ids)}
        prereqs_map = {p.task_id: p for p in Task.objects.filter(task_id__in=prereq_ids)}
        teams_map = {tm.team_id: tm for tm in Team.objects.filter(team_id__in=team_ids_set)}
        projects_map = {pj.project_id: pj for pj in Project.objects.filter(project_id__in=project_ids)}

        results = []
        for t in task_list:
            data = TaskSerializer(t).data
            assignee = users_map.get(t.assignee_id)
            creator = users_map.get(t.creator_id)
            prereq = prereqs_map.get(t.prerequisite_task_id)
            team = teams_map.get(t.team_id)
            project = projects_map.get(t.project_id)

            data['assignee_name'] = assignee.name if assignee else 'Unassigned'
            data['assignee_email'] = assignee.email if assignee else ''
            data['creator_name'] = creator.name if creator else ''
            data['prerequisite_title'] = prereq.title if prereq else ''
            data['prerequisite_status'] = prereq.status if prereq else ''
            data['team_name'] = team.name if team else ''
            data['project_title'] = project.title if project else ''
            data['isOverdue'] = False
            results.append(data)

        return Response({'tasks': results})

    def post(self, request):
        user = get_auth_user(request)
        if not user:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

        if user.role != 'admin':
            return Response({'error': 'Permission denied: Only administrators can create tasks.'}, status=status.HTTP_403_FORBIDDEN)

        data = request.data
        title = data.get('title', '').strip()
        if not title:
            return Response({'error': 'Task title is required'}, status=status.HTTP_400_BAD_REQUEST)

        task_id = 'task_' + secrets.token_hex(5)
        task = Task.objects.create(
            task_id=task_id,
            title=title,
            description=data.get('description', '').strip(),
            assignee_id=data.get('assignee_id') or user.user_id,
            creator_id=user.user_id,
            team_id=data.get('team_id') or None,
            project_id=data.get('project_id') or None,
            priority=data.get('priority', 'Medium'),
            status=data.get('status', 'Pending'),
            task_type=data.get('task_type', 'Independent'),
            prerequisite_task_id=data.get('prerequisite_task_id') or None,
            deadline=data.get('deadline') or None,
            progress=int(data.get('progress', 0)),
            duration_hours=float(data.get('duration_hours', 1.0)),
            category=data.get('category', 'General')
        )

        log_activity(user.user_id, user.name, 'CREATE_TASK', 'Task', task.task_id, f"Created task: {task.title}")

        if task.team_id:
            team_members = TeamMember.objects.filter(team_id=task.team_id).exclude(user_id=user.user_id).values_list('user_id', flat=True)
            for m_uid in team_members:
                Notification.objects.create(
                    notification_id='notif_' + secrets.token_hex(6),
                    user_id=m_uid,
                    title="New Team Task Assigned",
                    message=f"Task '{task.title}' was assigned to your group",
                    type='task_assigned'
                )

        return Response({'message': 'Task created successfully', 'task_id': task.task_id}, status=status.HTTP_201_CREATED)

class TaskDetailView(APIView):
    def put(self, request, pk):
        user = get_auth_user(request)
        if not user:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            task = Task.objects.get(task_id=pk)
        except Task.DoesNotExist:
            return Response({'error': 'Task not found'}, status=status.HTTP_404_NOT_FOUND)

        is_admin = user.role == 'admin'
        data = request.data

        if is_admin:
            if 'title' in data: task.title = data['title'].strip()
            if 'description' in data: task.description = data['description'].strip()
            if 'priority' in data: task.priority = data['priority']
            if 'category' in data: task.category = data['category']
            if 'deadline' in data: task.deadline = data['deadline']
            if 'duration_hours' in data: task.duration_hours = float(data['duration_hours'])
            if 'assignee_id' in data: task.assignee_id = data['assignee_id']
            if 'team_id' in data: task.team_id = data['team_id'] or None
            if 'project_id' in data: task.project_id = data['project_id'] or None
            if 'prerequisite_task_id' in data: task.prerequisite_task_id = data['prerequisite_task_id'] or None
            if 'task_type' in data: task.task_type = data['task_type']

        if 'status' in data:
            task.status = data['status']
            if data['status'] == 'Completed':
                task.completed_at = dj_timezone.now()
                # Unblock dependent tasks
                Task.objects.filter(prerequisite_task_id=task.task_id, status='Blocked').update(status='Pending')
        if 'progress' in data:
            task.progress = int(data['progress'])

        task.save()
        log_activity(user.user_id, user.name, 'UPDATE_TASK', 'Task', task.task_id, f"Updated task: {task.title}")
        return Response({'message': 'Task updated successfully'})

    def delete(self, request, pk):
        user = get_auth_user(request)
        if not user or user.role != 'admin':
            return Response({'error': 'Permission denied: Only administrators can delete tasks.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            task = Task.objects.get(task_id=pk)
            task_title = task.title
            task.delete()
            log_activity(user.user_id, user.name, 'DELETE_TASK', 'Task', pk, f"Deleted task: {task_title}")
            return Response({'message': 'Task deleted successfully'})
        except Task.DoesNotExist:
            return Response({'error': 'Task not found'}, status=status.HTTP_404_NOT_FOUND)

# ----------------------------------------------------
# TEAMS & GROUPS VIEWS
# ----------------------------------------------------

class TeamListView(APIView):
    def get(self, request):
        seed_defaults()
        user = get_auth_user(request)
        if not user:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

        if user.role == 'admin':
            teams = Team.objects.all().order_by('-created_at')
        else:
            user_team_ids = TeamMember.objects.filter(user_id=user.user_id).values_list('team_id', flat=True)
            teams = Team.objects.filter(team_id__in=user_team_ids).order_by('-created_at')
        results = []
        for t in teams:
            member_ids = TeamMember.objects.filter(team_id=t.team_id).values_list('user_id', flat=True)
            member_users = UserAccount.objects.filter(user_id__in=member_ids)
            creator = UserAccount.objects.filter(user_id=t.created_by).first()

            data = {
                'team_id': t.team_id,
                'name': t.name,
                'description': t.description,
                'created_by': t.created_by,
                'creator_name': creator.name if creator else '',
                'created_at': t.created_at.isoformat(),
                'member_count': len(member_ids),
                'task_count': Task.objects.filter(team_id=t.team_id).count(),
                'project_count': Project.objects.filter(team_id=t.team_id).count(),
                'members': [{'user_id': u.user_id, 'name': u.name, 'email': u.email, 'role': u.role} for u in member_users],
                'is_member': user.user_id in member_ids
            }
            results.append(data)
        return Response({'teams': results})

    def post(self, request):
        user = get_auth_user(request)
        if not user or user.role != 'admin':
            return Response({'error': 'Permission denied: Only administrators can create teams.'}, status=status.HTTP_403_FORBIDDEN)

        name = request.data.get('name', '').strip()
        description = request.data.get('description', '').strip()
        member_ids = request.data.get('member_ids', [])

        if not name:
            return Response({'error': 'Team name is required'}, status=status.HTTP_400_BAD_REQUEST)

        team_id = 'team_' + secrets.token_hex(5)
        team = Team.objects.create(team_id=team_id, name=name, description=description, created_by=user.user_id)
        TeamMember.objects.create(team_id=team_id, user_id=user.user_id)

        if isinstance(member_ids, list):
            for m_id in member_ids:
                if m_id and m_id != user.user_id:
                    TeamMember.objects.get_or_create(team_id=team_id, user_id=m_id)

        log_activity(user.user_id, user.name, 'CREATE_TEAM', 'Team', team_id, f"Created team: {name}")
        return Response({'message': 'Team created successfully', 'team_id': team_id}, status=status.HTTP_201_CREATED)

class TeamMemberManageView(APIView):
    def post(self, request, pk):
        user = get_auth_user(request)
        if not user or user.role != 'admin':
            return Response({'error': 'Permission denied: Only administrators can manage team members.'}, status=status.HTTP_403_FORBIDDEN)

        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        TeamMember.objects.get_or_create(team_id=pk, user_id=user_id)
        return Response({'message': 'Member added to team'})

    def delete(self, request, pk, user_id):
        user = get_auth_user(request)
        if not user or user.role != 'admin':
            return Response({'error': 'Permission denied: Only administrators can remove team members.'}, status=status.HTTP_403_FORBIDDEN)

        TeamMember.objects.filter(team_id=pk, user_id=user_id).delete()
        return Response({'message': 'Member removed from team'})

class TeamDetailView(APIView):
    def delete(self, request, pk):
        user = get_auth_user(request)
        if not user or user.role != 'admin':
            return Response({'error': 'Permission denied: Only administrators can delete teams.'}, status=status.HTTP_403_FORBIDDEN)

        Team.objects.filter(team_id=pk).delete()
        TeamMember.objects.filter(team_id=pk).delete()
        Task.objects.filter(team_id=pk).update(team_id=None)
        Project.objects.filter(team_id=pk).update(team_id=None)
        log_activity(user.user_id, user.name, 'DELETE_TEAM', 'Team', pk, f"Deleted team {pk}")
        return Response({'message': 'Team deleted successfully'})

# ----------------------------------------------------
# PROJECTS VIEWS
# ----------------------------------------------------

class ProjectListView(APIView):
    def get(self, request):
        seed_defaults()
        user = get_auth_user(request)
        if not user:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

        if user.role == 'admin':
            projects = Project.objects.all().order_by('-created_at')
        else:
            user_team_ids = TeamMember.objects.filter(user_id=user.user_id).values_list('team_id', flat=True)
            projects = Project.objects.filter(
                models.Q(team_id__in=user_team_ids) | models.Q(lead_id=user.user_id)
            ).order_by('-created_at')
        results = []
        for p in projects:
            tasks = Task.objects.filter(project_id=p.project_id)
            total = tasks.count()
            comp = tasks.filter(status='Completed').count()
            calc_prog = round((comp / total) * 100) if total > 0 else (p.progress or 0)

            team = Team.objects.filter(team_id=p.team_id).first() if p.team_id else None
            lead = UserAccount.objects.filter(user_id=p.lead_id).first() if p.lead_id else None

            data = ProjectSerializer(p).data
            data['team_name'] = team.name if team else ''
            data['lead_name'] = lead.name if lead else ''
            data['total_tasks'] = total
            data['completed_tasks'] = comp
            data['calculated_progress'] = calc_prog
            results.append(data)

        return Response({'projects': results})

    def post(self, request):
        user = get_auth_user(request)
        if not user or user.role != 'admin':
            return Response({'error': 'Permission denied: Only administrators can create projects.'}, status=status.HTTP_403_FORBIDDEN)

        title = request.data.get('title', '').strip()
        if not title:
            return Response({'error': 'Project title is required'}, status=status.HTTP_400_BAD_REQUEST)

        project_id = 'proj_' + secrets.token_hex(5)
        proj = Project.objects.create(
            project_id=project_id,
            title=title,
            description=request.data.get('description', '').strip(),
            team_id=request.data.get('team_id') or None,
            lead_id=request.data.get('lead_id') or user.user_id,
            status=request.data.get('status', 'Active'),
            deadline=request.data.get('deadline') or None,
            progress=int(request.data.get('progress', 0))
        )

        log_activity(user.user_id, user.name, 'CREATE_PROJECT', 'Project', project_id, f"Created project: {title}")
        return Response({'message': 'Project created successfully', 'project_id': project_id}, status=status.HTTP_201_CREATED)

class ProjectDetailView(APIView):
    def put(self, request, pk):
        user = get_auth_user(request)
        if not user or user.role != 'admin':
            return Response({'error': 'Permission denied: Only administrators can edit projects.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            p = Project.objects.get(project_id=pk)
            data = request.data
            if 'title' in data: p.title = data['title'].strip()
            if 'description' in data: p.description = data['description'].strip()
            if 'team_id' in data: p.team_id = data['team_id'] or None
            if 'lead_id' in data: p.lead_id = data['lead_id'] or None
            if 'status' in data: p.status = data['status']
            if 'deadline' in data: p.deadline = data['deadline'] or None
            if 'progress' in data: p.progress = int(data['progress'])
            p.save()
            return Response({'message': 'Project updated successfully'})
        except Project.DoesNotExist:
            return Response({'error': 'Project not found'}, status=status.HTTP_404_NOT_FOUND)

    def delete(self, request, pk):
        user = get_auth_user(request)
        if not user or user.role != 'admin':
            return Response({'error': 'Permission denied: Only administrators can delete projects.'}, status=status.HTTP_403_FORBIDDEN)

        Project.objects.filter(project_id=pk).delete()
        Task.objects.filter(project_id=pk).update(project_id=None)
        log_activity(user.user_id, user.name, 'DELETE_PROJECT', 'Project', pk, f"Deleted project {pk}")
        return Response({'message': 'Project deleted successfully'})

# ----------------------------------------------------
# USERS MANAGEMENT VIEWS (ADMIN)
# ----------------------------------------------------

class UserListView(APIView):
    def get(self, request):
        user = get_auth_user(request)
        if not user or user.role != 'admin':
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        users = UserAccount.objects.all().order_by('-created_at')
        results = []
        for u in users:
            d = UserAccountSerializer(u).data
            d['total_tasks'] = Task.objects.filter(assignee_id=u.user_id).count()
            d['completed_tasks'] = Task.objects.filter(assignee_id=u.user_id, status='Completed').count()
            results.append(d)
        return Response({'users': results})

    def post(self, request):
        user = get_auth_user(request)
        if not user or user.role != 'admin':
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        data = request.data
        name = data.get('name', '').strip()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')

        if not name or not email or not password:
            return Response({'error': 'Name, email, and password are required'}, status=status.HTTP_400_BAD_REQUEST)

        if UserAccount.objects.filter(email=email).exists():
            return Response({'error': 'User with this email already exists'}, status=status.HTTP_400_BAD_REQUEST)

        h, s = hash_password(password)
        new_user = UserAccount.objects.create(
            user_id='user_' + secrets.token_hex(6),
            name=name,
            age=int(data.get('age', 20)),
            gender=data.get('gender', 'Unspecified'),
            email=email,
            password_hash=h,
            password_salt=s,
            role=data.get('role', 'user'),
            account_status='active',
            avatar_color='#2563eb'
        )

        log_activity(user.user_id, user.name, 'ADMIN_ADD_USER', 'User', new_user.user_id, f"Admin added user {name} ({email})")
        return Response({'message': 'User added successfully', 'userId': new_user.user_id})

class AssignableUsersView(APIView):
    def get(self, request):
        users = UserAccount.objects.filter(account_status='active')
        return Response({'users': [{'user_id': u.user_id, 'name': u.name, 'email': u.email, 'role': u.role} for u in users]})

class UserStatusView(APIView):
    def put(self, request, pk):
        user = get_auth_user(request)
        if not user or user.role != 'admin':
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        if pk == user.user_id:
            return Response({'error': 'You cannot deactivate your own admin account'}, status=status.HTTP_400_BAD_REQUEST)

        status_val = request.data.get('status', 'active')
        UserAccount.objects.filter(user_id=pk).update(account_status=status_val)
        return Response({'message': f'User account {status_val} successfully'})

# ----------------------------------------------------
# ROUTINES, PLANS, NOTES, SCHEDULES, MESSAGES, NOTIFICATIONS
# ----------------------------------------------------

class RoutineListView(APIView):
    def get(self, request):
        user = get_auth_user(request)
        if not user: return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
        routines = Routine.objects.filter(user_id=user.user_id)
        return Response({'routines': RoutineSerializer(routines, many=True).data})

    def post(self, request):
        user = get_auth_user(request)
        if not user: return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
        title = request.data.get('title', '').strip()
        if not title: return Response({'error': 'Title is required'}, status=status.HTTP_400_BAD_REQUEST)

        r = Routine.objects.create(
            routine_id='rt_' + secrets.token_hex(5),
            user_id=user.user_id,
            title=title,
            routine_type=request.data.get('routine_type', 'custom'),
            scheduled_time=request.data.get('scheduled_time', '08:00 AM'),
            streak=0
        )
        return Response({'message': 'Routine created', 'routine_id': r.routine_id})

class RoutineLogView(APIView):
    def post(self, request, pk):
        user = get_auth_user(request)
        if not user: return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            r = Routine.objects.get(routine_id=pk, user_id=user.user_id)
            status_val = request.data.get('status', 'Completed')
            if status_val == 'Completed':
                r.streak += 1
                r.save(update_fields=['streak'])
            return Response({'message': 'Routine logged successfully', 'streak': r.streak})
        except Routine.DoesNotExist:
            return Response({'error': 'Routine not found'}, status=status.HTTP_404_NOT_FOUND)

class PlanListView(APIView):
    def get(self, request):
        user = get_auth_user(request)
        if not user: return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
        plans = Plan.objects.filter(user_id=user.user_id)
        results = []
        now = datetime.now(timezone.utc)
        for p in plans:
            d = PlanSerializer(p).data
            # Compute days remaining
            try:
                target = datetime.fromisoformat(p.target_date).replace(tzinfo=timezone.utc)
                d['daysRemaining'] = max(0, (target - now).days)
            except Exception:
                d['daysRemaining'] = 45

            prog = round((p.completed_hours / p.target_hours) * 100) if p.target_hours > 0 else 0
            d['progress'] = min(100, prog)
            ms = PlanMilestone.objects.filter(plan_id=p.plan_id)
            d['milestones'] = [{'milestone_id': m.milestone_id, 'title': m.title, 'completed': m.completed} for m in ms]
            results.append(d)
        return Response({'plans': results})

    def post(self, request):
        user = get_auth_user(request)
        if not user: return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
        goal = request.data.get('goal_name', '').strip()
        if not goal: return Response({'error': 'Goal name required'}, status=status.HTTP_400_BAD_REQUEST)

        p = Plan.objects.create(
            plan_id='plan_' + secrets.token_hex(5),
            user_id=user.user_id,
            goal_name=goal,
            category=request.data.get('category', 'Academic'),
            target_date=request.data.get('target_date', '2026-12-31'),
            duration_label=request.data.get('duration_label', '3 Months'),
            completed_hours=0.0,
            target_hours=float(request.data.get('target_hours', 100.0))
        )
        return Response({'message': 'Plan created', 'plan_id': p.plan_id})

class NoteListView(APIView):
    def get(self, request):
        user = get_auth_user(request)
        if not user: return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
        notes = Note.objects.filter(user_id=user.user_id).order_by('-pinned', '-updated_at')
        return Response({'notes': NoteSerializer(notes, many=True).data})

    def post(self, request):
        user = get_auth_user(request)
        if not user: return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
        title = request.data.get('title', '').strip()
        if not title: return Response({'error': 'Title is required'}, status=status.HTTP_400_BAD_REQUEST)

        n = Note.objects.create(
            note_id='note_' + secrets.token_hex(5),
            user_id=user.user_id,
            title=title,
            content=request.data.get('content', '').strip(),
            pinned=bool(request.data.get('pinned', False)),
            color=request.data.get('color', '#3b82f6')
        )
        return Response({'message': 'Note created', 'note_id': n.note_id})

class NoteDetailView(APIView):
    def put(self, request, pk):
        user = get_auth_user(request)
        if not user: return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            n = Note.objects.get(note_id=pk, user_id=user.user_id)
            if 'title' in request.data: n.title = request.data['title'].strip()
            if 'content' in request.data: n.content = request.data['content'].strip()
            if 'pinned' in request.data: n.pinned = bool(request.data['pinned'])
            if 'color' in request.data: n.color = request.data['color']
            n.save()
            return Response({'message': 'Note updated'})
        except Note.DoesNotExist:
            return Response({'error': 'Note not found'}, status=status.HTTP_404_NOT_FOUND)

    def delete(self, request, pk):
        user = get_auth_user(request)
        if not user: return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
        Note.objects.filter(note_id=pk, user_id=user.user_id).delete()
        return Response({'message': 'Note deleted'})

class ScheduleListView(APIView):
    def get(self, request):
        user = get_auth_user(request)
        if not user: return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
        schs = Schedule.objects.filter(user_id=user.user_id).order_by('start_time')
        return Response({'schedules': ScheduleSerializer(schs, many=True).data})

    def post(self, request):
        user = get_auth_user(request)
        if not user: return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
        title = request.data.get('title', '').strip()
        start = request.data.get('start_time', '').strip()
        end = request.data.get('end_time', '').strip()
        if not title or not start or not end:
            return Response({'error': 'Title, start time, and end time are required'}, status=status.HTTP_400_BAD_REQUEST)

        s = Schedule.objects.create(
            schedule_id='sch_' + secrets.token_hex(5),
            user_id=user.user_id,
            title=title,
            day_of_week=request.data.get('day_of_week', 'Daily'),
            start_time=start,
            end_time=end,
            activity_type=request.data.get('activity_type', 'Study'),
            color=request.data.get('color', '#3b82f6'),
            linked_task_id=request.data.get('linked_task_id') or None
        )
        return Response({'message': 'Schedule slot created', 'scheduleId': s.schedule_id})

class ScheduleDetailView(APIView):
    def delete(self, request, pk):
        user = get_auth_user(request)
        if not user: return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
        Schedule.objects.filter(schedule_id=pk, user_id=user.user_id).delete()
        return Response({'message': 'Schedule deleted'})

class MessageListView(APIView):
    def get(self, request):
        user = get_auth_user(request)
        if not user:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

        team_id = request.query_params.get('team_id')
        chat_with = request.query_params.get('user_id')

        # 1. Team/Group Messages
        if team_id:
            if user.role != 'admin':
                is_member = TeamMember.objects.filter(team_id=team_id, user_id=user.user_id).exists()
                if not is_member:
                    return Response({'error': 'Access denied: You are not a member of this team/group.'}, status=status.HTTP_403_FORBIDDEN)
            msgs = Message.objects.filter(team_id=team_id).order_by('created_at')

        # 2. Direct 1-on-1 Messages
        elif chat_with:
            msgs = Message.objects.filter(
                team_id__isnull=True
            ).filter(
                (models.Q(sender_id=user.user_id, receiver_id=chat_with) |
                 models.Q(sender_id=chat_with, receiver_id=user.user_id))
            ).order_by('created_at')

        # 3. Default: User sees DM messages and messages from their teams
        else:
            if user.role == 'admin':
                msgs = Message.objects.all().order_by('created_at')
            else:
                user_teams = TeamMember.objects.filter(user_id=user.user_id).values_list('team_id', flat=True)
                msgs = Message.objects.filter(
                    models.Q(team_id__in=user_teams) |
                    (models.Q(team_id__isnull=True) & (models.Q(sender_id=user.user_id) | models.Q(receiver_id=user.user_id)))
                ).order_by('created_at')

        # Enrich messages with sender name and team name
        msg_list = list(msgs)
        sender_ids = {m.sender_id for m in msg_list}
        team_ids_set = {m.team_id for m in msg_list if m.team_id}
        senders_map = {u.user_id: u.name for u in UserAccount.objects.filter(user_id__in=sender_ids)}
        teams_map = {t.team_id: t.name for t in Team.objects.filter(team_id__in=team_ids_set)}

        data = []
        for m in msg_list:
            m_data = MessageSerializer(m).data
            m_data['sender_name'] = senders_map.get(m.sender_id, 'User')
            m_data['team_name'] = teams_map.get(m.team_id, '')
            data.append(m_data)

        return Response({'messages': data})

    def post(self, request):
        user = get_auth_user(request)
        if not user:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

        content = request.data.get('content', '').strip()
        if not content:
            return Response({'error': 'Message content cannot be empty'}, status=status.HTTP_400_BAD_REQUEST)

        team_id = request.data.get('team_id')
        receiver_id = request.data.get('receiver_id')

        # Case A: Post to a Team/Group
        if team_id:
            team = Team.objects.filter(team_id=team_id).first()
            if not team:
                return Response({'error': 'Team/group not found'}, status=status.HTTP_404_NOT_FOUND)
            if user.role != 'admin':
                is_member = TeamMember.objects.filter(team_id=team_id, user_id=user.user_id).exists()
                if not is_member:
                    return Response({'error': 'Permission denied: You are not a member of this team/group.'}, status=status.HTTP_403_FORBIDDEN)

            m = Message.objects.create(
                message_id='msg_' + secrets.token_hex(6),
                sender_id=user.user_id,
                team_id=team_id,
                receiver_id=None,
                content=content,
                read_status=False
            )

            # Notify team members
            member_user_ids = TeamMember.objects.filter(team_id=team_id).exclude(user_id=user.user_id).values_list('user_id', flat=True)
            for m_uid in member_user_ids:
                Notification.objects.create(
                    notification_id='notif_' + secrets.token_hex(6),
                    user_id=m_uid,
                    title=f"New message in {team.name}",
                    message=f"{user.name}: {content[:60]}",
                    type='team_message'
                )

            return Response({
                'message': 'Team message sent successfully',
                'message_id': m.message_id,
                'team_id': team_id
            })

        # Case B: Post 1-on-1 Direct Message
        if not receiver_id:
            if user.role == 'admin':
                return Response({'error': 'Please select a recipient user or team'}, status=status.HTTP_400_BAD_REQUEST)
            admin = UserAccount.objects.filter(role='admin').first()
            if not admin:
                return Response({'error': 'No administrator account available to receive messages'}, status=status.HTTP_400_BAD_REQUEST)
            receiver_id = admin.user_id

        m = Message.objects.create(
            message_id='msg_' + secrets.token_hex(6),
            sender_id=user.user_id,
            receiver_id=receiver_id,
            team_id=None,
            content=content,
            read_status=False
        )

        Notification.objects.create(
            notification_id='notif_' + secrets.token_hex(6),
            user_id=receiver_id,
            title=f"New message from {user.name}",
            message=content[:60],
            type='direct_message'
        )

        return Response({
            'message': 'Message sent successfully',
            'message_id': m.message_id,
            'receiver_id': receiver_id
        })

class NotificationListView(APIView):
    def get(self, request):
        user = get_auth_user(request)
        if not user: return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
        notifs = Notification.objects.filter(user_id=user.user_id).order_by('-created_at')[:20]
        return Response({'notifications': NotificationSerializer(notifs, many=True).data})

class NotificationReadAllView(APIView):
    def put(self, request):
        user = get_auth_user(request)
        if not user: return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
        Notification.objects.filter(user_id=user.user_id).update(read_status=True)
        return Response({'message': 'All notifications marked as read'})

# ----------------------------------------------------
# ANALYTICS & LOGS VIEWS
# ----------------------------------------------------

class AnalyticsReportsView(APIView):
    def get(self, request):
        user = get_auth_user(request)
        if not user or user.role != 'admin':
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        tasks = Task.objects.all()
        total = tasks.count()
        completed = tasks.filter(status='Completed').count()
        rate = round((completed / total) * 100) if total > 0 else 0

        # Workload per user
        users = UserAccount.objects.all()
        workload = []
        for u in users:
            u_tasks = tasks.filter(assignee_id=u.user_id)
            u_comp = u_tasks.filter(status='Completed').count()
            workload.append({
                'user_id': u.user_id,
                'name': u.name,
                'total_tasks': u_tasks.count(),
                'completed_tasks': u_comp,
                'pending_tasks': u_tasks.filter(status='Pending').count()
            })

        return Response({
            'overview': {
                'total_tasks': total,
                'completed_tasks': completed,
                'completion_rate': rate,
                'active_projects': Project.objects.filter(status='Active').count(),
                'total_teams': Team.objects.count()
            },
            'workload': workload
        })

class AnalyticsLogsView(APIView):
    def get(self, request):
        user = get_auth_user(request)
        if not user or user.role != 'admin':
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        logs = ActivityLog.objects.all().order_by('-timestamp')[:50]
        return Response({'logs': ActivityLogSerializer(logs, many=True).data})

# ----------------------------------------------------
# PYTHON AI CHATBOT VIEW
# ----------------------------------------------------

class AiChatView(APIView):
    def post(self, request):
        user = get_auth_user(request)
        if not user:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

        prompt = request.data.get('prompt', '').strip()
        if not prompt:
            return Response({'error': 'Prompt is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Context-aware intelligent response using current task and schedule state
        p_lower = prompt.lower()
        if 'task' in p_lower or 'pending' in p_lower:
            tasks = Task.objects.filter(assignee_id=user.user_id, status__in=['Pending', 'In Progress'])
            titles = [t.title for t in tasks[:3]]
            reply = f"You currently have {tasks.count()} active tasks. Your highest priority items are: {', '.join(titles) if titles else 'None right now. Great job!'}."
        elif 'routine' in p_lower or 'schedule' in p_lower:
            rts = Routine.objects.filter(user_id=user.user_id)
            reply = f"You have {rts.count()} scheduled daily routines. Staying consistent with your morning routine will boost your overall sprint velocity!"
        elif 'project' in p_lower or 'team' in p_lower:
            teams = TeamMember.objects.filter(user_id=user.user_id).count()
            reply = f"You are connected to {teams} active team(s). All shared tasks and project deliverables are synchronized in real time."
        else:
            reply = f"Taskaro AI Assistant is active. I can help organize your study schedule, track critical path dependencies, manage project deadlines, and prioritize pending tasks."

        return Response({'reply': reply})
