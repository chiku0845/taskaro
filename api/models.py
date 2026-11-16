from django.db import models

class UserAccount(models.Model):
    user_id = models.CharField(max_length=100, primary_key=True)
    name = models.CharField(max_length=150)
    age = models.IntegerField(default=20)
    gender = models.CharField(max_length=50, default='Unspecified')
    email = models.EmailField(unique=True)
    password_hash = models.CharField(max_length=255)
    password_salt = models.CharField(max_length=255)
    role = models.CharField(max_length=20, default='user')  # 'user' or 'admin'
    account_status = models.CharField(max_length=20, default='active')
    avatar_color = models.CharField(max_length=20, default='#2563eb')
    last_login = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.email}) - {self.role}"

class Team(models.Model):
    team_id = models.CharField(max_length=100, primary_key=True)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    created_by = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

class TeamMember(models.Model):
    team_id = models.CharField(max_length=100)
    user_id = models.CharField(max_length=100)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('team_id', 'user_id')

class Project(models.Model):
    project_id = models.CharField(max_length=100, primary_key=True)
    title = models.CharField(max_length=250)
    description = models.TextField(blank=True, default='')
    team_id = models.CharField(max_length=100, null=True, blank=True)
    lead_id = models.CharField(max_length=100, null=True, blank=True)
    status = models.CharField(max_length=50, default='Active')
    deadline = models.CharField(max_length=50, null=True, blank=True)
    progress = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title

class Task(models.Model):
    task_id = models.CharField(max_length=100, primary_key=True)
    title = models.CharField(max_length=250)
    description = models.TextField(blank=True, default='')
    assignee_id = models.CharField(max_length=100)
    creator_id = models.CharField(max_length=100)
    team_id = models.CharField(max_length=100, null=True, blank=True)
    project_id = models.CharField(max_length=100, null=True, blank=True)
    priority = models.CharField(max_length=20, default='Medium')
    status = models.CharField(max_length=30, default='Pending')
    task_type = models.CharField(max_length=30, default='Independent')
    prerequisite_task_id = models.CharField(max_length=100, null=True, blank=True)
    deadline = models.CharField(max_length=50, null=True, blank=True)
    progress = models.IntegerField(default=0)
    duration_hours = models.FloatField(default=1.0)
    category = models.CharField(max_length=100, default='General')
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

class Routine(models.Model):
    routine_id = models.CharField(max_length=100, primary_key=True)
    user_id = models.CharField(max_length=100)
    title = models.CharField(max_length=200)
    routine_type = models.CharField(max_length=50, default='custom')
    scheduled_time = models.CharField(max_length=50, default='08:00 AM')
    streak = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

class RoutineLog(models.Model):
    log_id = models.CharField(max_length=100, primary_key=True)
    routine_id = models.CharField(max_length=100)
    user_id = models.CharField(max_length=100)
    status = models.CharField(max_length=50)
    date = models.CharField(max_length=50)
    logged_at = models.DateTimeField(auto_now_add=True)

class Plan(models.Model):
    plan_id = models.CharField(max_length=100, primary_key=True)
    user_id = models.CharField(max_length=100)
    goal_name = models.CharField(max_length=250)
    category = models.CharField(max_length=100, default='Academic')
    target_date = models.CharField(max_length=50)
    duration_label = models.CharField(max_length=100, default='3 Months')
    completed_hours = models.FloatField(default=0)
    target_hours = models.FloatField(default=100)
    created_at = models.DateTimeField(auto_now_add=True)

class PlanMilestone(models.Model):
    milestone_id = models.CharField(max_length=100, primary_key=True)
    plan_id = models.CharField(max_length=100)
    title = models.CharField(max_length=250)
    due_week = models.IntegerField(default=1)
    completed = models.BooleanField(default=False)

class Note(models.Model):
    note_id = models.CharField(max_length=100, primary_key=True)
    user_id = models.CharField(max_length=100)
    title = models.CharField(max_length=250)
    content = models.TextField(blank=True, default='')
    pinned = models.BooleanField(default=False)
    color = models.CharField(max_length=50, default='#3b82f6')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class Schedule(models.Model):
    schedule_id = models.CharField(max_length=100, primary_key=True)
    user_id = models.CharField(max_length=100)
    title = models.CharField(max_length=250)
    day_of_week = models.CharField(max_length=50, default='Daily')
    start_time = models.CharField(max_length=50)
    end_time = models.CharField(max_length=50)
    activity_type = models.CharField(max_length=50, default='Study')
    color = models.CharField(max_length=50, default='#3b82f6')
    linked_task_id = models.CharField(max_length=100, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

class Message(models.Model):
    message_id = models.CharField(max_length=100, primary_key=True)
    sender_id = models.CharField(max_length=100)
    receiver_id = models.CharField(max_length=100)
    content = models.TextField()
    read_status = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

class Notification(models.Model):
    notification_id = models.CharField(max_length=100, primary_key=True)
    user_id = models.CharField(max_length=100)
    title = models.CharField(max_length=250)
    message = models.TextField()
    type = models.CharField(max_length=50, default='system')
    read_status = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

class ActivityLog(models.Model):
    log_id = models.CharField(max_length=100, primary_key=True)
    actor_id = models.CharField(max_length=100)
    actor_name = models.CharField(max_length=150)
    action = models.CharField(max_length=100)
    entity_type = models.CharField(max_length=100)
    entity_id = models.CharField(max_length=100)
    details = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
