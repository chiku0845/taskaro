from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('api', '0003_message_team_id_alter_message_receiver_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='plan',
            name='description',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='plan',
            name='start_date',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
        migrations.CreateModel(
            name='PlanTopic',
            fields=[
                ('topic_id', models.CharField(max_length=100, primary_key=True, serialize=False)),
                ('plan_id', models.CharField(max_length=100)),
                ('title', models.CharField(max_length=250)),
                ('allocated_hours', models.FloatField(default=2.0)),
                ('status', models.CharField(default='Pending', max_length=50)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
        ),
    ]
