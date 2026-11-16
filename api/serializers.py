from rest_framework import serializers
from .models import (
    UserAccount, Team, TeamMember, Project, Task,
    Routine, RoutineLog, Plan, PlanMilestone, Note,
    Schedule, Message, Notification, ActivityLog
)

class UserAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserAccount
        fields = ['user_id', 'name', 'age', 'gender', 'email', 'role', 'account_status', 'avatar_color', 'created_at', 'last_login']
        read_only_fields = ['created_at', 'last_login']

class TeamMemberSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='user.name', read_only=True)
    email = serializers.CharField(source='user.email', read_only=True)

    class Meta:
        model = TeamMember
        fields = ['team_id', 'user_id', 'joined_at', 'name', 'email']

class TeamSerializer(serializers.ModelSerializer):
    member_count = serializers.IntegerField(read_only=True, default=0)
    task_count = serializers.IntegerField(read_only=True, default=0)
    project_count = serializers.IntegerField(read_only=True, default=0)
    creator_name = serializers.CharField(read_only=True, default='')
    members = serializers.SerializerMethodField()
    is_member = serializers.BooleanField(read_only=True, default=False)

    class Meta:
        model = Team
        fields = ['team_id', 'name', 'description', 'created_by', 'created_at', 'member_count', 'task_count', 'project_count', 'creator_name', 'members', 'is_member']

    def get_members(self, obj):
        member_ids = TeamMember.objects.filter(team_id=obj.team_id).values_list('user_id', flat=True)
        users = UserAccount.objects.filter(user_id__in=member_ids)
        return [{'user_id': u.user_id, 'name': u.name, 'email': u.email, 'role': u.role} for u in users]

class ProjectSerializer(serializers.ModelSerializer):
    team_name = serializers.CharField(read_only=True, default='')
    lead_name = serializers.CharField(read_only=True, default='')
    total_tasks = serializers.IntegerField(read_only=True, default=0)
    completed_tasks = serializers.IntegerField(read_only=True, default=0)
    calculated_progress = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Project
        fields = ['project_id', 'title', 'description', 'team_id', 'lead_id', 'status', 'deadline', 'progress', 'created_at', 'team_name', 'lead_name', 'total_tasks', 'completed_tasks', 'calculated_progress']

class TaskSerializer(serializers.ModelSerializer):
    assignee_name = serializers.CharField(read_only=True, default='')
    assignee_email = serializers.CharField(read_only=True, default='')
    creator_name = serializers.CharField(read_only=True, default='')
    prerequisite_title = serializers.CharField(read_only=True, default='')
    prerequisite_status = serializers.CharField(read_only=True, default='')
    team_name = serializers.CharField(read_only=True, default='')
    project_title = serializers.CharField(read_only=True, default='')
    isOverdue = serializers.BooleanField(read_only=True, default=False)

    class Meta:
        model = Task
        fields = [
            'task_id', 'title', 'description', 'assignee_id', 'creator_id',
            'team_id', 'project_id', 'priority', 'status', 'task_type',
            'prerequisite_task_id', 'deadline', 'progress', 'duration_hours',
            'category', 'completed_at', 'created_at', 'updated_at',
            'assignee_name', 'assignee_email', 'creator_name',
            'prerequisite_title', 'prerequisite_status',
            'team_name', 'project_title', 'isOverdue'
        ]

class RoutineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Routine
        fields = ['routine_id', 'user_id', 'title', 'routine_type', 'scheduled_time', 'streak', 'created_at']

class PlanMilestoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlanMilestone
        fields = ['milestone_id', 'plan_id', 'title', 'due_week', 'completed']

class PlanSerializer(serializers.ModelSerializer):
    milestones = PlanMilestoneSerializer(many=True, read_only=True)
    daysRemaining = serializers.IntegerField(read_only=True, default=0)
    progress = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Plan
        fields = ['plan_id', 'user_id', 'goal_name', 'category', 'target_date', 'duration_label', 'completed_hours', 'target_hours', 'created_at', 'milestones', 'daysRemaining', 'progress']

class NoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Note
        fields = ['note_id', 'user_id', 'title', 'content', 'pinned', 'color', 'created_at', 'updated_at']

class ScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Schedule
        fields = ['schedule_id', 'user_id', 'title', 'day_of_week', 'start_time', 'end_time', 'activity_type', 'color', 'linked_task_id', 'created_at']

class MessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(read_only=True, default='')
    team_name = serializers.CharField(read_only=True, default='')

    class Meta:
        model = Message
        fields = ['message_id', 'sender_id', 'receiver_id', 'team_id', 'content', 'read_status', 'created_at', 'sender_name', 'team_name']

class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['notification_id', 'user_id', 'title', 'message', 'type', 'read_status', 'created_at']

class ActivityLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityLog
        fields = ['log_id', 'actor_id', 'actor_name', 'action', 'entity_type', 'entity_id', 'details', 'timestamp']
