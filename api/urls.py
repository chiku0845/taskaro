from django.urls import path
from . import views

urlpatterns = [
    # Auth
    path('auth/signup', views.SignupView.as_view(), name='auth_signup'),
    path('auth/login', views.LoginView.as_view(), name='auth_login'),
    path('auth/me', views.MeView.as_view(), name='auth_me'),
    path('auth/profile', views.ProfileUpdateView.as_view(), name='auth_profile'),
    path('auth/change-password', views.ChangePasswordView.as_view(), name='auth_change_password'),
    path('auth/send-otp', views.SendOtpView.as_view(), name='auth_send_otp'),
    path('auth/verify-otp', views.VerifyOtpView.as_view(), name='auth_verify_otp'),
    path('auth/google', views.GoogleOAuthView.as_view(), name='auth_google'),

    # Dashboard
    path('dashboard/stats', views.DashboardStatsView.as_view(), name='dashboard_stats'),

    # Tasks
    path('tasks', views.TaskListView.as_view(), name='task_list'),
    path('tasks/<str:pk>', views.TaskDetailView.as_view(), name='task_detail'),

    # Teams
    path('teams', views.TeamListView.as_view(), name='team_list'),
    path('teams/<str:pk>', views.TeamDetailView.as_view(), name='team_detail'),
    path('teams/<str:pk>/members', views.TeamMemberManageView.as_view(), name='team_members_add'),
    path('teams/<str:pk>/members/<str:user_id>', views.TeamMemberManageView.as_view(), name='team_member_remove'),

    # Projects
    path('projects', views.ProjectListView.as_view(), name='project_list'),
    path('projects/<str:pk>', views.ProjectDetailView.as_view(), name='project_detail'),

    # Users (Admin)
    path('users', views.UserListView.as_view(), name='user_list'),
    path('users/assignable', views.AssignableUsersView.as_view(), name='assignable_users'),
    path('users/<str:pk>/status', views.UserStatusView.as_view(), name='user_status'),

    # Routines
    path('routines', views.RoutineListView.as_view(), name='routine_list'),
    path('routines/<str:pk>/log', views.RoutineLogView.as_view(), name='routine_log'),

    # Plans
    path('plans', views.PlanListView.as_view(), name='plan_list'),

    # Notes
    path('notes', views.NoteListView.as_view(), name='note_list'),
    path('notes/<str:pk>', views.NoteDetailView.as_view(), name='note_detail'),

    # Schedules
    path('schedules', views.ScheduleListView.as_view(), name='schedule_list'),
    path('schedules/<str:pk>', views.ScheduleDetailView.as_view(), name='schedule_detail'),

    # Messages
    path('messages', views.MessageListView.as_view(), name='message_list'),

    # Notifications
    path('notifications', views.NotificationListView.as_view(), name='notification_list'),
    path('notifications/read-all', views.NotificationReadAllView.as_view(), name='notification_read_all'),

    # Analytics & Logs
    path('analytics/reports', views.AnalyticsReportsView.as_view(), name='analytics_reports'),
    path('analytics/logs', views.AnalyticsLogsView.as_view(), name='analytics_logs'),

    # AI Chatbot
    path('ai/chat', views.AiChatView.as_view(), name='ai_chat'),
]
