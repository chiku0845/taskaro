from django.contrib import admin
from .models import (
    UserAccount, Team, TeamMember, Project, Task,
    Routine, Plan, Note, Schedule, Message,
    Notification, ActivityLog
)

@admin.register(UserAccount)
class UserAccountAdmin(admin.ModelAdmin):
    list_display = ('name', 'email', 'role', 'account_status', 'created_at')
    search_fields = ('name', 'email')
    list_filter = ('role', 'account_status')

@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ('name', 'team_id', 'created_by', 'created_at')
    search_fields = ('name', 'team_id')

@admin.register(TeamMember)
class TeamMemberAdmin(admin.ModelAdmin):
    list_display = ('team_id', 'user_id', 'joined_at')
    list_filter = ('team_id',)

@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('title', 'project_id', 'team_id', 'status', 'progress', 'deadline')
    list_filter = ('status',)

@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'task_id', 'assignee_id', 'priority', 'status', 'progress', 'deadline')
    list_filter = ('status', 'priority', 'task_type')
    search_fields = ('title', 'description')

@admin.register(Routine)
class RoutineAdmin(admin.ModelAdmin):
    list_display = ('title', 'user_id', 'routine_type', 'scheduled_time', 'streak')

@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ('goal_name', 'user_id', 'category', 'target_date', 'completed_hours', 'target_hours')

@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ('title', 'user_id', 'pinned', 'updated_at')

@admin.register(Schedule)
class ScheduleAdmin(admin.ModelAdmin):
    list_display = ('title', 'user_id', 'day_of_week', 'start_time', 'end_time', 'activity_type')

@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ('sender_id', 'receiver_id', 'content', 'read_status', 'created_at')

@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('title', 'user_id', 'type', 'read_status', 'created_at')

@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = ('actor_name', 'action', 'entity_type', 'entity_id', 'timestamp')
    list_filter = ('action', 'entity_type')
