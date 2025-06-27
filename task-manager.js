class TaskManager {
    constructor() {
        this.recurringTasks = [];
        this.completions = {};
        this.singleTasks = [];
        this.apiBaseUrl = this.getApiBaseUrl();
    }

    getApiBaseUrl() {
        // Use the same host as the current page but port 8001 for API
        const host = window.location.hostname;
        return `http://${host}:8001`;
    }

    async loadTasks() {
        try {
            // Load single tasks (non-recurring)
            const singleResponse = await fetch('./single-tasks.json?t=' + Date.now());
            if (singleResponse.ok) {
                this.singleTasks = await singleResponse.json();
            } else {
                this.singleTasks = [];
            }

            // Load recurring tasks
            const recurringResponse = await fetch('./recurring-tasks.json?t=' + Date.now());
            if (recurringResponse.ok) {
                this.recurringTasks = await recurringResponse.json();
            } else {
                this.recurringTasks = [];
            }

            // Load completion states
            const completionsResponse = await fetch('./task-completions.json?t=' + Date.now());
            if (completionsResponse.ok) {
                this.completions = await completionsResponse.json();
            } else {
                this.completions = {};
            }
        } catch (error) {
            console.error('Error loading tasks:', error);
            this.singleTasks = [];
            this.recurringTasks = [];
            this.completions = {};
        }
    }

    getTasksForDate(date) {
        const dateStr = this.formatDateForStorage(date);
        console.log('TaskManager.getTasksForDate called for:', dateStr);
        console.log('Available single tasks:', this.singleTasks.map(t => `${t.title} (${t.date})`));
        console.log('Available recurring tasks:', this.recurringTasks);
        
        const tasks = [];

        // Get single tasks for this date
        const singleTasksForDate = this.singleTasks.filter(task => task.date === dateStr);
        console.log('Single tasks for', dateStr, ':', singleTasksForDate);
        tasks.push(...singleTasksForDate);

        // Generate recurring tasks for this date
        this.recurringTasks.forEach(recurringTask => {
            if (this.shouldShowTaskOnDate(recurringTask, date)) {
                const taskInstance = this.createTaskInstance(recurringTask, dateStr);
                tasks.push(taskInstance);
            }
        });

        console.log('Total tasks for', dateStr, ':', tasks);
        return tasks.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    }

    shouldShowTaskOnDate(recurringTask, date) {
        const taskDate = new Date(recurringTask.recurrence.startDate);
        const checkDate = new Date(date);

        // Check if date is before start date
        if (checkDate < taskDate) return false;

        // Check end conditions
        if (recurringTask.recurrence.end === 'on') {
            const endDate = new Date(recurringTask.recurrence.endDate);
            if (checkDate > endDate) return false;
        }

        // Calculate days difference
        const daysDiff = Math.floor((checkDate - taskDate) / (1000 * 60 * 60 * 24));

        // Check recurrence pattern
        switch (recurringTask.recurrence.type) {
            case 'daily':
                return daysDiff % (recurringTask.recurrence.interval || 1) === 0;
            case 'weekly':
                return daysDiff % ((recurringTask.recurrence.interval || 1) * 7) === 0;
            case 'monthly':
                // Simple monthly check (can be improved for exact date matching)
                const monthsDiff = (checkDate.getFullYear() - taskDate.getFullYear()) * 12 + 
                                  (checkDate.getMonth() - taskDate.getMonth());
                return monthsDiff % (recurringTask.recurrence.interval || 1) === 0 &&
                       checkDate.getDate() === taskDate.getDate();
            default:
                return false;
        }
    }

    createTaskInstance(recurringTask, dateStr) {
        const instanceId = `${recurringTask.id}_${dateStr}`;
        return {
            ...recurringTask,
            id: instanceId,
            date: dateStr,
            completed: this.completions[recurringTask.id]?.[dateStr] || false,
            recurrenceId: recurringTask.id
        };
    }

    async toggleTaskComplete(taskId) {
        if (taskId.includes('_')) {
            // This is a recurring task instance
            const [recurringId, date] = taskId.split('_');
            if (!this.completions[recurringId]) {
                this.completions[recurringId] = {};
            }
            this.completions[recurringId][date] = !this.completions[recurringId][date];
            await this.saveCompletions();
        } else {
            // This is a single task
            const task = this.singleTasks.find(t => t.id === taskId);
            if (task) {
                task.completed = !task.completed;
                await this.saveSingleTasks();
            }
        }
    }

    async addTask(task) {
        if (task.recurrence) {
            // Add as recurring task
            const recurringTask = {
                id: task.id || Date.now().toString(),
                title: task.title,
                description: task.description,
                type: task.type,
                startTime: task.startTime,
                endTime: task.endTime,
                recurrence: {
                    ...task.recurrence,
                    startDate: task.date
                }
            };
            this.recurringTasks.push(recurringTask);
            await this.saveRecurringTasks();
        } else {
            // Add as single task
            this.singleTasks.push(task);
            await this.saveSingleTasks();
        }
    }

    async updateTask(task) {
        console.log('TaskManager.updateTask called with:', task);
        console.log('Current recurring tasks:', this.recurringTasks.map(t => t.id));
        console.log('Current single tasks:', this.singleTasks.map(t => t.id));
        
        // Get the base task ID (use recurrenceId if available, otherwise extract from instance ID)
        let baseTaskId = task.recurrenceId || task.id;
        if (!task.recurrenceId && task.id && task.id.includes('_') && task.id.match(/_\d{4}-\d{2}-\d{2}$/)) {
            // This is a recurring task instance ID (ends with _YYYY-MM-DD)
            baseTaskId = task.id.replace(/_\d{4}-\d{2}-\d{2}$/, '');
        }
        
        console.log('Task has recurrenceId:', task.recurrenceId);
        console.log('Task ID:', task.id);
        console.log('Determined base ID:', baseTaskId);
        
        // Step 1: Remove the task from BOTH collections completely
        let removedFromRecurring = false;
        let removedFromSingle = false;
        
        const recurringIndex = this.recurringTasks.findIndex(t => t.id === baseTaskId);
        if (recurringIndex !== -1) {
            console.log('Removing from recurring tasks at index:', recurringIndex);
            this.recurringTasks.splice(recurringIndex, 1);
            delete this.completions[baseTaskId];
            removedFromRecurring = true;
        }
        
        const singleIndex = this.singleTasks.findIndex(t => t.id === baseTaskId);
        if (singleIndex !== -1) {
            console.log('Removing from single tasks at index:', singleIndex);
            this.singleTasks.splice(singleIndex, 1);
            removedFromSingle = true;
        }
        
        // Step 2: Save the removal changes first
        if (removedFromRecurring || removedFromSingle) {
            console.log('Saving removal changes...');
            const savePromises = [];
            if (removedFromRecurring) {
                savePromises.push(this.saveRecurringTasks());
                savePromises.push(this.saveCompletions());
            }
            if (removedFromSingle) {
                savePromises.push(this.saveSingleTasks());
            }
            await Promise.all(savePromises);
        }
        
        // Step 3: Add the task to the correct collection
        if (task.recurrence && task.recurrence.type !== 'none') {
            console.log('Adding to recurring tasks');
            const recurringTask = {
                id: baseTaskId,
                title: task.title,
                description: task.description,
                type: task.type,
                startTime: task.startTime,
                endTime: task.endTime,
                recurrence: {
                    ...task.recurrence,
                    startDate: task.date || new Date().toISOString().split('T')[0]
                }
            };
            this.recurringTasks.push(recurringTask);
            await this.saveRecurringTasks();
            await this.saveCompletions();
        } else {
            console.log('Adding to single tasks');
            const singleTask = {
                id: baseTaskId,
                title: task.title,
                description: task.description,
                type: task.type,
                startTime: task.startTime,
                endTime: task.endTime,
                date: task.date || new Date().toISOString().split('T')[0],
                completed: task.completed || false
            };
            this.singleTasks.push(singleTask);
            await this.saveSingleTasks();
        }
        
        console.log('Task update complete');
        console.log('Final recurring tasks:', this.recurringTasks.map(t => t.id));
        console.log('Final single tasks:', this.singleTasks.map(t => t.id));
    }

    async deleteTask(taskId) {
        if (taskId.includes('_')) {
            // Delete recurring task instance or all instances
            const [recurringId] = taskId.split('_');
            const index = this.recurringTasks.findIndex(t => t.id === recurringId);
            if (index !== -1) {
                this.recurringTasks.splice(index, 1);
                delete this.completions[recurringId];
                await Promise.all([this.saveRecurringTasks(), this.saveCompletions()]);
            }
        } else {
            // Delete single task
            const index = this.singleTasks.findIndex(t => t.id === taskId);
            if (index !== -1) {
                this.singleTasks.splice(index, 1);
                await this.saveSingleTasks();
            }
        }
    }

    async saveRecurringTasks() {
        try {
            console.log('Saving recurring tasks to file...');
            const response = await fetch(`${this.apiBaseUrl}/api/save-file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: 'recurring-tasks.json',
                    content: this.recurringTasks
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            console.log('Recurring tasks saved:', result);
        } catch (error) {
            console.error('Error saving recurring tasks:', error);
            throw error;
        }
    }

    async saveCompletions() {
        try {
            console.log('Saving task completions...');
            const response = await fetch(`${this.apiBaseUrl}/api/save-file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: 'task-completions.json',
                    content: this.completions
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            console.log('Task completions saved:', result);
        } catch (error) {
            console.error('Error saving completions:', error);
        }
    }

    async saveSingleTasks() {
        try {
            console.log('Saving single tasks to file...');
            const response = await fetch(`${this.apiBaseUrl}/api/save-file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: 'single-tasks.json',
                    content: this.singleTasks
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            console.log('Single tasks saved:', result);
        } catch (error) {
            console.error('Error saving single tasks:', error);
            throw error;
        }
    }

    formatDateForStorage(date) {
        return date.toISOString().split('T')[0];
    }
}

// Export for use in script.js
window.TaskManager = TaskManager;