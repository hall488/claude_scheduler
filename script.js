class ScheduleApp {
    constructor() {
        this.currentDate = new Date();
        this.selectedDate = new Date();
        this.currentView = 'month';
        this.taskManager = new TaskManager();
        this.editingTask = null;
        this.isDarkMode = localStorage.getItem('darkMode') === 'true';
        this.userIsEditing = false; // Track when user is making changes
        this.changeSource = 'user'; // Track if changes come from 'user' or 'claude'
        this.chatHistory = []; // Store recent chat messages for context
        this.apiBaseUrl = this.getApiBaseUrl(); // Detect API URL based on current host
        
        this.initializeElements();
        this.bindEvents();
        this.applyTheme();
        this.init();
    }

    getApiBaseUrl() {
        // Use the same host as the current page but port 8001 for API
        const host = window.location.hostname;
        return `http://${host}:8001`;
    }

    async init() {
        console.log('Loading from new task management system');
        console.log('Today is:', new Date());
        console.log('Selected date is:', this.selectedDate);
        console.log('Current date is:', this.currentDate);
        
        await this.taskManager.loadTasks();
        
        // FORCE today to be selected from the start
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset to start of day in local timezone
        this.selectedDate = today;
        this.selectedDateEl.textContent = this.formatDate(today);
        
        // Render with today selected
        this.render();
        
        this.startFileWatcher();
    }

    initializeElements() {
        this.calendar = document.getElementById('calendar');
        this.currentMonthEl = document.getElementById('currentMonth');
        this.selectedDateEl = document.getElementById('selectedDate');
        this.tasksListEl = document.getElementById('tasksList');
        this.taskModal = document.getElementById('taskModal');
        this.taskForm = document.getElementById('taskForm');
    }

    bindEvents() {
        document.getElementById('prevBtn').addEventListener('click', () => this.navigate(-1));
        document.getElementById('nextBtn').addEventListener('click', () => this.navigate(1));
        document.getElementById('addTaskBtn').addEventListener('click', () => this.openTaskModal());
        document.getElementById('cancelBtn').addEventListener('click', () => this.closeTaskModal());
        document.getElementById('monthView').addEventListener('click', () => this.switchView('month'));
        document.getElementById('weekView').addEventListener('click', () => this.switchView('week'));
        document.getElementById('dayView').addEventListener('click', () => this.switchView('day'));
        document.getElementById('darkModeToggle').addEventListener('click', () => this.toggleDarkMode());
        document.getElementById('toggleChat').addEventListener('click', () => this.toggleChat());
        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        // Mobile navigation events
        this.bindMobileEvents();
        
        this.taskForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveTask();
        });

        this.taskModal.addEventListener('click', (e) => {
            if (e.target === this.taskModal) {
                this.closeTaskModal();
            }
        });

        // Recurrence UI events
        document.getElementById('taskRecurrence').addEventListener('change', (e) => {
            document.getElementById('customRecurrence').style.display = 
                e.target.value === 'custom' ? 'block' : 'none';
        });

        document.getElementById('recurrenceEnd').addEventListener('change', (e) => {
            document.getElementById('recurrenceCount').style.display = 
                e.target.value === 'after' ? 'inline-block' : 'none';
            document.getElementById('recurrenceEndDate').style.display = 
                e.target.value === 'on' ? 'inline-block' : 'none';
        });
    }

    switchView(view) {
        this.currentView = view;
        document.querySelectorAll('.view-toggle button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(view + 'View').classList.add('active');
        this.render();
    }

    navigate(direction) {
        if (this.currentView === 'month') {
            this.currentDate.setMonth(this.currentDate.getMonth() + direction);
        } else if (this.currentView === 'week') {
            this.selectedDate.setDate(this.selectedDate.getDate() + (direction * 7));
            this.currentDate = new Date(this.selectedDate);
        } else if (this.currentView === 'day') {
            this.selectedDate.setDate(this.selectedDate.getDate() + direction);
            this.currentDate = new Date(this.selectedDate);
        }
        this.render();
    }

    render() {
        // Save scroll position for day view
        const timeTable = document.getElementById('timeTable');
        const scrollTop = (this.currentView === 'day' && timeTable) ? timeTable.scrollTop : 0;
        
        this.updateMonthHeader();
        if (this.currentView === 'month') {
            this.renderMonthView();
        } else if (this.currentView === 'week') {
            this.renderWeekView();
        } else {
            this.renderDayView();
        }
        this.renderTasks();
        
        // Re-render time table tasks if in day view and restore scroll
        if (this.currentView === 'day') {
            setTimeout(() => {
                this.renderTasksInTimeTable();
                const newTimeTable = document.getElementById('timeTable');
                if (newTimeTable && scrollTop > 0) {
                    newTimeTable.scrollTop = scrollTop;
                }
            }, 50);
        }
    }

    updateMonthHeader() {
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        
        if (this.currentView === 'month') {
            this.currentMonthEl.textContent = `${monthNames[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;
        } else if (this.currentView === 'week') {
            const startOfWeek = new Date(this.selectedDate);
            startOfWeek.setDate(this.selectedDate.getDate() - this.selectedDate.getDay());
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            
            this.currentMonthEl.textContent = `Week of ${startOfWeek.toLocaleDateString()} - ${endOfWeek.toLocaleDateString()}`;
        } else if (this.currentView === 'day') {
            this.currentMonthEl.textContent = this.selectedDate.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }
    }

    renderMonthView() {
        const firstDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
        const lastDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - firstDay.getDay());

        this.calendar.innerHTML = '';
        this.calendar.className = 'calendar-grid';

        // Add day headers
        const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayHeaders.forEach(day => {
            const header = document.createElement('div');
            header.className = 'day-header';
            header.textContent = day;
            header.style.cssText = 'padding: 10px; text-align: center; font-weight: bold;';
            this.calendar.appendChild(header);
        });

        // Add calendar days
        for (let i = 0; i < 42; i++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            
            const dayEl = this.createDayElement(date);
            this.calendar.appendChild(dayEl);
        }
    }

    renderWeekView() {
        const startOfWeek = new Date(this.selectedDate);
        startOfWeek.setDate(this.selectedDate.getDate() - this.selectedDate.getDay());

        this.calendar.innerHTML = '';
        this.calendar.className = 'week-view';

        for (let i = 0; i < 7; i++) {
            const date = new Date(startOfWeek);
            date.setDate(startOfWeek.getDate() + i);
            
            const dayEl = this.createWeekDayElement(date);
            this.calendar.appendChild(dayEl);
        }
    }

    renderDayView() {
        this.calendar.innerHTML = '';
        this.calendar.className = 'day-view';
        
        const dayEl = document.createElement('div');
        dayEl.innerHTML = `
            <h3>${this.formatDate(this.selectedDate)}</h3>
            <div class="time-table" id="timeTable">
                ${this.renderTimeSlots()}
            </div>
        `;
        this.calendar.appendChild(dayEl);
        this.renderTasksInTimeTable();
    }

    createDayElement(date) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
        dayEl.setAttribute('data-date', this.formatDateForStorage(date));
        
        const isCurrentMonth = date.getMonth() === this.currentDate.getMonth();
        const isToday = this.isToday(date);
        const isSelected = this.isSameDate(date, this.selectedDate);
        
        if (!isCurrentMonth) dayEl.classList.add('other-month');
        if (isToday) dayEl.classList.add('today');
        if (isSelected) dayEl.classList.add('selected');

        const dayTasks = this.getTasksForDate(date);
        
        dayEl.innerHTML = `
            <div class="day-number">${date.getDate()}</div>
            ${dayTasks.slice(0, 3).map(task => `<div class="task-indicator" style="background: ${this.getTaskTypeColor(task.type)};"></div>`).join('')}
            ${dayTasks.length > 3 ? `<div style="font-size: 10px; color: #666;">+${dayTasks.length - 3} more</div>` : ''}
        `;

        dayEl.addEventListener('click', () => {
            this.selectDate(date);
        });

        // Add month view drag-and-drop support
        this.addMonthDragAndDropListeners(dayEl);

        return dayEl;
    }

    createWeekDayElement(date) {
        const dayEl = document.createElement('div');
        const isSelected = this.isSameDate(date, this.selectedDate);
        const isToday = this.isToday(date);
        
        dayEl.className = `week-day${isSelected ? ' selected' : ''}${isToday ? ' today' : ''}`;
        
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayTasks = this.getTasksForDate(date);
        
        dayEl.innerHTML = `
            <h4>${dayNames[date.getDay()]} ${date.getDate()}</h4>
            <div class="day-tasks" data-date="${this.formatDateForStorage(date)}">
                ${dayTasks.map(task => `
                    <div class="task-mini ${task.completed ? 'completed' : ''}" 
                         style="border-left: 3px solid ${this.getTaskTypeColor(task.type)};"
                         draggable="true"
                         data-task-id="${task.id}">
                        ${task.startTime || task.endTime ? this.formatTimeRange(task.startTime, task.endTime) + ' - ' : ''}${task.title}
                    </div>
                `).join('')}
            </div>
        `;

        dayEl.addEventListener('click', (e) => {
            // Only select date if not dragging
            if (!e.target.closest('.task-mini')) {
                this.selectDate(date);
            }
        });

        // Add drag and drop support
        this.addWeekDragAndDropListeners(dayEl);
        
        // Add double-click handlers to tasks
        dayEl.querySelectorAll('.task-mini').forEach(taskEl => {
            taskEl.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const taskId = taskEl.getAttribute('data-task-id');
                this.editTask(taskId);
            });
        });

        return dayEl;
    }

    renderDayTasks() {
        const dayTasks = this.getTasksForDate(this.selectedDate);
        if (dayTasks.length === 0) {
            return '<p>No tasks for this day</p>';
        }

        return dayTasks.map(task => `
            <div class="day-task" style="border-left: 4px solid ${this.getTaskTypeColor(task.type)};">
                ${task.type ? `<div class="task-type ${task.type}" style="margin-bottom: 8px;">${task.type}</div>` : ''}
                <div style="display: flex; justify-content: space-between;">
                    <h4>${task.title}</h4>
                    <span class="task-time">${this.formatTimeRange(task.startTime, task.endTime)}</span>
                </div>
                ${task.description ? `<div style="color: #666; margin-top: 5px; font-size: 11px;">${this.renderMarkdown(task.description)}</div>` : ''}
            </div>
        `).join('');
    }

    selectDate(date) {
        this.selectedDate = new Date(date);
        this.selectedDateEl.textContent = this.formatDate(date);
        this.render();
        
        // Update mobile tasks if panel is open
        if (document.getElementById('mobileTasksPanel')?.classList.contains('show')) {
            this.renderMobileTasks();
            document.getElementById('mobileSelectedDate').textContent = this.formatDate(date);
        }
    }

    renderTasks() {
        const dayTasks = this.getTasksForDate(this.selectedDate);
        
        if (dayTasks.length === 0) {
            this.tasksListEl.innerHTML = '<p>No tasks for this day</p>';
            return;
        }

        this.tasksListEl.innerHTML = dayTasks.map(task => `
            <div class="task-item ${task.type || 'other'} ${task.completed ? 'completed' : ''}"
                 data-task-id="${task.id}"
                 draggable="true">
                <div class="task-checkbox">
                    <input type="checkbox" id="task-check-${task.id}" ${task.completed ? 'checked' : ''} 
                           onchange="app.toggleTaskComplete('${task.id}')">
                </div>
                <div class="task-content">
                    ${task.type ? `<div class="task-type ${task.type}">${task.type}</div>` : ''}
                    <h4>${task.title} ${task.recurrenceId ? '<span class="recurrence-indicator" title="Recurring task">🔁</span>' : ''}</h4>
                    ${task.description ? `<div class="task-description">${this.renderMarkdown(task.description)}</div>` : ''}
                    ${task.startTime || task.endTime ? `<div class="task-time">${this.formatTimeRange(task.startTime, task.endTime)}</div>` : ''}
                </div>
                <div class="task-actions">
                    <button class="edit-btn" onclick="app.editTask('${task.id}')">✏️</button>
                    <button class="delete-btn" onclick="app.deleteTask('${task.id}')">🗑️</button>
                </div>
            </div>
        `).join('');
        
        // Add drag listeners to sidebar tasks
        this.addSidebarDragListeners();
    }

    openTaskModal(task = null) {
        console.log('openTaskModal called with task:', task);
        this.editingTask = task;
        
        if (task) {
            document.getElementById('taskTitle').value = task.title;
            document.getElementById('taskDescription').value = task.description || '';
            document.getElementById('taskType').value = task.type || '';
            document.getElementById('taskStartTime').value = task.startTime || '';
            document.getElementById('taskEndTime').value = task.endTime || '';
            
            // Set recurrence fields
            if (task.recurrence) {
                document.getElementById('taskRecurrence').value = task.recurrence.type;
                if (task.recurrence.type === 'custom') {
                    document.getElementById('customRecurrence').style.display = 'block';
                    document.getElementById('recurrenceInterval').value = task.recurrence.interval || 1;
                    document.getElementById('recurrenceFrequency').value = task.recurrence.frequency || 'days';
                    document.getElementById('recurrenceEnd').value = task.recurrence.end || 'never';
                    
                    if (task.recurrence.end === 'after') {
                        document.getElementById('recurrenceCount').value = task.recurrence.count || 10;
                        document.getElementById('recurrenceCount').style.display = 'inline-block';
                    } else if (task.recurrence.end === 'on') {
                        document.getElementById('recurrenceEndDate').value = task.recurrence.endDate || '';
                        document.getElementById('recurrenceEndDate').style.display = 'inline-block';
                    }
                }
            } else {
                document.getElementById('taskRecurrence').value = 'none';
                document.getElementById('customRecurrence').style.display = 'none';
            }
        } else {
            this.taskForm.reset();
            document.getElementById('taskRecurrence').value = 'none';
            document.getElementById('customRecurrence').style.display = 'none';
        }
        
        console.log('Setting modal display to block');
        this.taskModal.style.display = 'block';
        console.log('Modal element:', this.taskModal);
    }

    closeTaskModal() {
        this.taskModal.style.display = 'none';
        this.editingTask = null;
    }

    async saveTask() {
        const title = document.getElementById('taskTitle').value;
        const description = document.getElementById('taskDescription').value;
        const type = document.getElementById('taskType').value;
        const startTime = document.getElementById('taskStartTime').value;
        const endTime = document.getElementById('taskEndTime').value;
        const recurrence = document.getElementById('taskRecurrence').value;

        let taskId;
        if (this.editingTask) {
            // For editing, preserve the original ID
            taskId = this.editingTask.recurrenceId || this.editingTask.id;
            // For recurring task instances, use the base recurring ID
            if (taskId.includes('_')) {
                taskId = taskId.split('_').slice(0, -1).join('_');
            }
        } else {
            // For new tasks, generate a new ID
            taskId = Date.now().toString();
        }

        const task = {
            id: taskId,
            title,
            description,
            type,
            startTime,
            endTime,
            date: this.formatDateForStorage(this.selectedDate),
            completed: this.editingTask ? this.editingTask.completed || false : false
        };

        // Preserve recurrenceId if editing a recurring task instance
        if (this.editingTask && this.editingTask.recurrenceId) {
            task.recurrenceId = this.editingTask.recurrenceId;
        }

        // Add recurrence data if not 'none'
        if (recurrence !== 'none') {
            task.recurrence = {
                type: recurrence,
                interval: 1,
                frequency: 'days',
                end: 'never'
            };

            if (recurrence === 'custom') {
                task.recurrence.interval = parseInt(document.getElementById('recurrenceInterval').value) || 1;
                task.recurrence.frequency = document.getElementById('recurrenceFrequency').value;
                task.recurrence.end = document.getElementById('recurrenceEnd').value;
                
                if (task.recurrence.end === 'after') {
                    task.recurrence.count = parseInt(document.getElementById('recurrenceCount').value) || 10;
                } else if (task.recurrence.end === 'on') {
                    task.recurrence.endDate = document.getElementById('recurrenceEndDate').value;
                }
            }
        }

        console.log('Editing task?', !!this.editingTask);
        console.log('Task to save:', task);
        
        if (this.editingTask) {
            console.log('Updating existing task');
            await this.taskManager.updateTask(task);
        } else {
            console.log('Adding new task');
            await this.taskManager.addTask(task);
        }
        this.closeTaskModal();
        
        // Preserve scroll position for day view
        const timeTable = document.getElementById('timeTable');
        const scrollTop = timeTable ? timeTable.scrollTop : 0;
        
        this.render();
        
        // Restore scroll position after render
        if (this.currentView === 'day' && timeTable) {
            setTimeout(() => {
                const newTimeTable = document.getElementById('timeTable');
                if (newTimeTable) {
                    newTimeTable.scrollTop = scrollTop;
                }
            }, 100);
        }
    }

    editTask(taskId) {
        console.log('editTask called with taskId:', taskId);
        const task = this.findTaskById(taskId);
        console.log('Found task:', task);
        if (task) {
            this.openTaskModal(task);
        } else {
            console.error('Task not found:', taskId);
        }
    }

    findTaskById(taskId) {
        console.log('findTaskById called with:', taskId);
        console.log('Available recurring tasks:', this.taskManager.recurringTasks);
        console.log('Available single tasks:', this.taskManager.singleTasks);
        
        // Check all possible task sources
        const allTasks = [
            ...this.taskManager.singleTasks,
            ...this.taskManager.recurringTasks
        ];
        
        // For recurring task instances, check if it matches a recurring task
        if (taskId.includes('_')) {
            const parts = taskId.split('_');
            // Handle format: claude_1719506520_2025-06-27
            const recurringId = parts.slice(0, -1).join('_'); // Everything except the date
            const date = parts[parts.length - 1]; // The date part
            
            console.log('Looking for recurring task with ID:', recurringId);
            const recurringTask = this.taskManager.recurringTasks.find(t => t.id === recurringId);
            console.log('Found recurring task:', recurringTask);
            
            if (recurringTask) {
                // Return the instance with the specific date
                return this.taskManager.createTaskInstance(recurringTask, date);
            }
        }
        
        return allTasks.find(t => t.id === taskId);
    }

    async deleteTask(taskId) {
        let confirmMessage = 'Are you sure you want to delete this task?';
        
        if (taskId.includes('_')) {
            confirmMessage = 'This is a recurring task. Delete all occurrences?';
        }
        
        if (confirm(confirmMessage)) {
            this.changeSource = 'user';
            await this.taskManager.deleteTask(taskId);
            this.render();
        }
    }

    async toggleTaskComplete(taskId) {
        this.changeSource = 'user';
        await this.taskManager.toggleTaskComplete(taskId);
        this.render();
    }

    getTasksForDate(date) {
        return this.taskManager.getTasksForDate(date);
    }

    formatDate(date) {
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    formatDateForStorage(date) {
        return date.toISOString().split('T')[0];
    }

    isToday(date) {
        const today = new Date();
        return this.isSameDate(date, today);
    }

    isSameDate(date1, date2) {
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    }

    async loadTasks() {
        // This method is no longer needed - TaskManager handles it
        return [];
    }

    async saveTasks(source = 'user') {
        console.log('Saving tasks through TaskManager...');
        
        if (source === 'user') {
            this.changeSource = 'user';
        }
    }

    async reloadFromFile() {
        try {
            await this.taskManager.loadTasks();
            this.render();
            console.log('Reloaded tasks from files');
            return true;
        } catch (error) {
            console.error('Failed to reload from files:', error);
            return false;
        }
    }

    // This method is no longer needed with the new task management system


    // generateRecurringTasks method is no longer needed with the new task management system

    getTaskTypeColor(type) {
        const colors = {
            work: '#007bff',
            exercise: '#28a745',
            wakeup: '#ffc107',
            bedtime: '#6f42c1',
            meal: '#fd7e14',
            meeting: '#dc3545',
            personal: '#20c997',
            health: '#e83e8c',
            social: '#17a2b8',
            other: '#6c757d'
        };
        return colors[type] || colors.other;
    }

    formatTimeRange(startTime, endTime) {
        if (startTime && endTime) {
            return `${this.formatTime12Hour(startTime)} - ${this.formatTime12Hour(endTime)}`;
        } else if (startTime) {
            return `${this.formatTime12Hour(startTime)}`;
        } else if (endTime) {
            return `Until ${this.formatTime12Hour(endTime)}`;
        }
        return '';
    }

    formatTime12Hour(time24) {
        if (!time24) return '';
        
        const [hours, minutes] = time24.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        
        return `${hour12}:${minutes} ${ampm}`;
    }

    renderTimeSlots() {
        let labelsHtml = '';
        let slotsHtml = '';
        
        for (let hour = 0; hour < 24; hour++) {
            for (let minute = 0; minute < 60; minute += 30) {
                const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                const displayTime = this.formatTime12Hour(timeStr);
                const isHour = minute === 0;
                
                labelsHtml += `
                    <div class="time-label ${isHour ? 'hour' : ''}">${isHour ? displayTime : ''}</div>
                `;
                
                slotsHtml += `
                    <div class="time-slot ${isHour ? 'hour' : ''}" data-time="${timeStr}"></div>
                `;
            }
        }
        
        return `
            <div class="time-labels">${labelsHtml}</div>
            <div class="time-grid">${slotsHtml}</div>
        `;
    }

    renderTasksInTimeTable() {
        const dayTasks = this.getTasksForDate(this.selectedDate);
        const timeTable = document.getElementById('timeTable');
        const timeGrid = document.querySelector('.time-grid');
        
        if (!timeGrid) return;
        
        // Save scroll position
        const scrollTop = timeTable.scrollTop;
        
        // Clear existing task blocks
        timeGrid.querySelectorAll('.task-block').forEach(block => block.remove());
        
        // Filter tasks with start times and calculate overlaps
        const timedTasks = dayTasks.filter(task => task.startTime);
        const tasksWithLayout = this.calculateTaskLayout(timedTasks);
        
        tasksWithLayout.forEach(taskLayout => {
            const taskBlock = this.createTaskBlock(taskLayout.task);
            this.positionTaskInTimeTable(taskBlock, taskLayout.task, taskLayout.column, taskLayout.totalColumns);
            timeGrid.appendChild(taskBlock);
        });
        
        // Add drop listeners to time slots for drag and drop
        timeGrid.querySelectorAll('.time-slot').forEach(timeSlot => {
            timeSlot.addEventListener('dragover', this.handleDragOver);
            timeSlot.addEventListener('drop', (event) => this.handleDrop(event));
            timeSlot.addEventListener('dragenter', this.handleDragEnter);
            timeSlot.addEventListener('dragleave', this.handleDragLeave);
        });
        
        // Restore scroll position
        timeTable.scrollTop = scrollTop;
    }

    createTaskBlock(task) {
        const taskBlock = document.createElement('div');
        taskBlock.className = `task-block ${task.type || 'other'}`;
        taskBlock.draggable = true;
        taskBlock.dataset.taskId = task.id;
        
        const duration = this.calculateTaskDuration(task);
        taskBlock.innerHTML = `
            <div style="font-weight: bold;">${task.title}</div>
            ${duration ? `<div style="font-size: 10px; opacity: 0.8;">${duration}</div>` : ''}
        `;
        
        // Add drag event listeners
        taskBlock.addEventListener('dragstart', (e) => this.handleDragStart(e));
        taskBlock.addEventListener('dragend', (e) => this.handleDragEnd(e));
        taskBlock.addEventListener('dblclick', () => this.editTask(task.id));
        
        return taskBlock;
    }

    positionTaskInTimeTable(taskBlock, task, column = 0, totalColumns = 1) {
        const startMinutes = this.timeToMinutes(task.startTime);
        const endMinutes = task.endTime ? this.timeToMinutes(task.endTime) : startMinutes + 30;
        const duration = endMinutes - startMinutes;
        
        // Each 30-min slot is 50px high
        const top = (startMinutes / 30) * 50;
        const height = Math.max((duration / 30) * 50, 25);
        
        // Calculate horizontal positioning for overlapping tasks
        const columnWidth = 100 / totalColumns;
        const left = column * columnWidth;
        const width = columnWidth - 1; // 1% gap between columns
        
        taskBlock.style.top = `${top}px`;
        taskBlock.style.height = `${height}px`;
        taskBlock.style.left = `${left}%`;
        taskBlock.style.width = `${width}%`;
    }

    calculateTaskLayout(tasks) {
        // Sort tasks by start time
        const sortedTasks = tasks.sort((a, b) => 
            this.timeToMinutes(a.startTime) - this.timeToMinutes(b.startTime)
        );
        
        const layout = [];
        const columns = [];
        
        sortedTasks.forEach(task => {
            const startMinutes = this.timeToMinutes(task.startTime);
            const endMinutes = task.endTime ? this.timeToMinutes(task.endTime) : startMinutes + 30;
            
            // Find the first available column
            let columnIndex = 0;
            while (columnIndex < columns.length && 
                   columns[columnIndex].some(existingTask => 
                       this.tasksOverlap(existingTask, { start: startMinutes, end: endMinutes })
                   )) {
                columnIndex++;
            }
            
            // Create new column if needed
            if (columnIndex >= columns.length) {
                columns.push([]);
            }
            
            // Add task to column
            columns[columnIndex].push({ start: startMinutes, end: endMinutes, task });
            
            layout.push({
                task,
                column: columnIndex,
                totalColumns: Math.max(columns.length, layout.length > 0 ? 
                    Math.max(...layout.map(l => l.totalColumns)) : 1)
            });
        });
        
        // Update all tasks with the final column count
        const maxColumns = columns.length;
        layout.forEach(item => {
            item.totalColumns = maxColumns;
        });
        
        return layout;
    }

    tasksOverlap(task1, task2) {
        return task1.start < task2.end && task2.start < task1.end;
    }

    timeToMinutes(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }

    minutesToTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }

    calculateTaskDuration(task) {
        if (!task.startTime || !task.endTime) return '';
        const start = this.timeToMinutes(task.startTime);
        const end = this.timeToMinutes(task.endTime);
        const duration = end - start;
        const hours = Math.floor(duration / 60);
        const minutes = duration % 60;
        
        if (hours > 0 && minutes > 0) {
            return `${hours}h ${minutes}m`;
        } else if (hours > 0) {
            return `${hours}h`;
        } else {
            return `${minutes}m`;
        }
    }

    addWeekDragAndDropListeners(dayEl) {
        const dayTasksContainer = dayEl.querySelector('.day-tasks');
        
        // Make the day-tasks container a drop zone
        dayTasksContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            dayTasksContainer.classList.add('drop-target');
        });
        
        dayTasksContainer.addEventListener('dragleave', (e) => {
            if (!dayTasksContainer.contains(e.relatedTarget)) {
                dayTasksContainer.classList.remove('drop-target');
            }
        });
        
        dayTasksContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            dayTasksContainer.classList.remove('drop-target');
            
            const taskId = e.dataTransfer.getData('text/plain');
            const newDate = dayTasksContainer.getAttribute('data-date');
            this.moveTaskToDate(taskId, newDate);
        });
        
        // Add drag listeners to task elements
        dayEl.querySelectorAll('.task-mini[draggable="true"]').forEach(taskEl => {
            taskEl.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', taskEl.getAttribute('data-task-id'));
                taskEl.classList.add('dragging');
            });
            
            taskEl.addEventListener('dragend', (e) => {
                taskEl.classList.remove('dragging');
            });
        });
    }

    async moveTaskToDate(taskId, newDate) {
        const task = this.findTaskById(taskId);
        if (task && task.date !== newDate) {
            this.userIsEditing = true;
            setTimeout(() => { this.userIsEditing = false; }, 3000);
            task.date = newDate;
            await this.taskManager.updateTask(task);
            this.render(); // Re-render to show the moved task
        }
    }

    handleDragStart(e) {
        e.dataTransfer.setData('text/plain', e.target.dataset.taskId);
        e.target.classList.add('dragging');
        
        // Add drop targets to both time slots and task blocks
        document.querySelectorAll('.time-slot, .task-block').forEach(element => {
            element.addEventListener('dragover', this.handleDragOver);
            element.addEventListener('drop', (event) => this.handleDrop(event));
            element.addEventListener('dragenter', this.handleDragEnter);
            element.addEventListener('dragleave', this.handleDragLeave);
        });
    }

    handleDragEnd(e) {
        e.target.classList.remove('dragging');
        
        // Remove drop targets from both time slots and task blocks
        document.querySelectorAll('.time-slot, .task-block').forEach(element => {
            element.removeEventListener('dragover', this.handleDragOver);
            element.removeEventListener('drop', this.handleDrop);
            element.removeEventListener('dragenter', this.handleDragEnter);
            element.removeEventListener('dragleave', this.handleDragLeave);
            element.classList.remove('drop-target');
        });
    }

    handleDragOver(e) {
        e.preventDefault();
    }

    handleDragEnter(e) {
        const timeSlot = e.target.closest('.time-slot');
        const taskBlock = e.target.closest('.task-block');
        
        if (timeSlot) {
            timeSlot.classList.add('drop-target');
        } else if (taskBlock) {
            taskBlock.classList.add('drop-target');
        }
    }

    handleDragLeave(e) {
        const timeSlot = e.target.closest('.time-slot');
        const taskBlock = e.target.closest('.task-block');
        
        if (timeSlot && !timeSlot.contains(e.relatedTarget)) {
            timeSlot.classList.remove('drop-target');
        } else if (taskBlock && !taskBlock.contains(e.relatedTarget)) {
            taskBlock.classList.remove('drop-target');
        }
    }

    async handleDrop(e) {
        e.preventDefault();
        const taskId = e.dataTransfer.getData('text/plain');
        const timeSlot = e.target.closest('.time-slot');
        const taskBlock = e.target.closest('.task-block');
        
        let newTime;
        
        if (timeSlot) {
            // Dropped on empty time slot
            newTime = timeSlot.dataset.time;
        } else if (taskBlock) {
            // Dropped on another task - calculate time from position
            const timeGrid = document.querySelector('.time-grid');
            const rect = timeGrid.getBoundingClientRect();
            const y = e.clientY - rect.top + timeGrid.scrollTop;
            const slotIndex = Math.floor(y / 50); // Each slot is 50px
            const hours = Math.floor(slotIndex / 2);
            const minutes = (slotIndex % 2) * 30;
            newTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        }
        
        if (newTime) {
            // Update task time using TaskManager
            const task = this.findTaskById(taskId);
            if (task) {
                this.changeSource = 'user';
                
                const oldDuration = task.endTime ? 
                    this.timeToMinutes(task.endTime) - this.timeToMinutes(task.startTime) : 30;
                
                task.startTime = newTime;
                if (task.endTime) {
                    const newEndMinutes = this.timeToMinutes(newTime) + oldDuration;
                    task.endTime = this.minutesToTime(newEndMinutes);
                }
                
                await this.taskManager.updateTask(task);
                this.renderTasksInTimeTable();
                this.renderTasks(); // Update sidebar
            }
        }
        
        // Clean up drop target styles
        if (timeSlot) timeSlot.classList.remove('drop-target');
        if (taskBlock) taskBlock.classList.remove('drop-target');
    }


    toggleDarkMode() {
        this.isDarkMode = !this.isDarkMode;
        localStorage.setItem('darkMode', this.isDarkMode);
        this.applyTheme();
    }

    applyTheme() {
        const body = document.body;
        const darkModeBtn = document.getElementById('darkModeToggle');
        
        if (this.isDarkMode) {
            body.setAttribute('data-theme', 'dark');
            darkModeBtn.textContent = '☀️';
        } else {
            body.removeAttribute('data-theme');
            darkModeBtn.textContent = '🌙';
        }
    }

    async handleReload() {
        const reloadBtn = document.getElementById('reloadBtn');
        reloadBtn.textContent = '⏳';
        reloadBtn.disabled = true;
        
        const success = await this.reloadFromFile();
        
        reloadBtn.textContent = success ? '✅' : '❌';
        setTimeout(() => {
            reloadBtn.textContent = '🔄';
            reloadBtn.disabled = false;
        }, 1000);
        
        if (success) {
            // Show toast notification
            this.showNotification('Tasks updated from Claude!');
        }
    }

    showNotification(message) {
        // Create temporary notification
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    startFileWatcher() {
        this.lastModified = null;
        this.isWatching = true;
        this.watchFile();
    }

    async watchFile() {
        if (!this.isWatching) return;

        try {
            // Check all task files for changes
            const files = ['recurring-tasks.json', 'task-completions.json', 'single-tasks.json'];
            let hasChanges = false;
            
            for (const file of files) {
                const response = await fetch(`./${file}?t=` + Date.now(), { method: 'HEAD' });
                if (response.ok) {
                    const lastModified = response.headers.get('Last-Modified');
                    const fileKey = `lastModified_${file.replace('.json', '').replace('-', '_')}`;
                    
                    if (this[fileKey] && lastModified !== this[fileKey]) {
                        hasChanges = true;
                        console.log(`File ${file} changed`);
                    }
                    this[fileKey] = lastModified;
                }
            }
            
            if (hasChanges) {
                if (this.changeSource === 'claude') {
                    console.log('Claude made changes, showing notification');
                    await this.taskManager.loadTasks();
                    this.render();
                    this.showNotification('🤖 Claude updated your schedule!');
                } else {
                    console.log('User made changes, no notification needed');
                    await this.taskManager.loadTasks();
                    this.render();
                }
                // Reset for next change detection
                this.changeSource = null;
            }
        } catch (error) {
            console.log('File watching error:', error.message);
        }

        // Check again in 2 seconds
        setTimeout(() => this.watchFile(), 2000);
    }

    stopFileWatcher() {
        this.isWatching = false;
    }

    toggleChat() {
        const container = document.getElementById('chatContainer');
        const toggleBtn = document.getElementById('toggleChat');
        
        if (container.style.display === 'none') {
            container.style.display = 'block';
            toggleBtn.textContent = '−';
        } else {
            container.style.display = 'none';
            toggleBtn.textContent = '+';
        }
    }

    async sendMessage() {
        const input = document.getElementById('chatInput');
        const messages = document.getElementById('chatMessages');
        const userMessage = input.value.trim();
        
        if (!userMessage) return;

        // Add user message to chat
        const userDiv = document.createElement('div');
        userDiv.className = 'user-message';
        userDiv.innerHTML = `<strong>You:</strong> ${userMessage}`;
        messages.appendChild(userDiv);

        // Add to chat history
        this.chatHistory.push({type: 'user', message: userMessage});

        // Add loading indicator with live timing
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'claude-message thinking';
        const funMessages = [
            '🧠 Analyzing your schedule...',
            '⚡ Thinking about time management...',
            '📅 Calculating optimal scheduling...',
            '🤖 Processing calendar logic...',
            '💭 Contemplating your request...',
            '⏰ Optimizing your time blocks...',
            '🎯 Planning your perfect schedule...',
            '✨ Weaving scheduling magic...'
        ];
        const randomMessage = funMessages[Math.floor(Math.random() * funMessages.length)];
        
        // Generate request ID
        const requestId = Date.now().toString();
        
        loadingDiv.innerHTML = `<strong>Claude:</strong> Processing your request...`;
        messages.appendChild(loadingDiv);

        // Clear input immediately
        input.value = '';
        messages.scrollTop = messages.scrollHeight;

        // Start live timer
        const startTime = Date.now();
        const timerInterval = setInterval(() => {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const timerElement = document.getElementById(`timer-${requestId}`);
            if (timerElement) {
                timerElement.textContent = elapsed;
            }
        }, 100);

        // Temporarily disable file change notifications since Claude is about to make changes
        this.userIsEditing = false; // Ensure Claude changes will show notifications
        
        // Send request to Claude API and get response (with chat history)
        const response = await this.sendToBridge(requestId, userMessage);
        
        // Calculate final response time
        const finalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        
        // Stop timer and replace with final response
        clearInterval(timerInterval);
        loadingDiv.className = 'claude-message';
        loadingDiv.innerHTML = `<strong>Claude:</strong> ${response}<div class="response-time">⏱️ ${finalTime}s</div>`;

        // Add Claude response to chat history
        this.chatHistory.push({type: 'claude', message: response});
        
        // Keep only last 10 messages to avoid context getting too long
        if (this.chatHistory.length > 10) {
            this.chatHistory = this.chatHistory.slice(-10);
        }

        // Final scroll to bottom (input already cleared)
        messages.scrollTop = messages.scrollHeight;
    }

    async sendToBridge(requestId, message) {
        try {
            // Build context with recent chat history
            const contextWithHistory = this.buildContextWithHistory(message);
            
            const response = await fetch(`${this.apiBaseUrl}/api/claude`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: contextWithHistory })
            });
            
            if (response.ok) {
                const data = await response.json();
                return data.response;
            } else {
                throw new Error('API request failed');
            }
        } catch (error) {
            console.error('Error calling Claude API:', error);
            return 'Error: Could not connect to Claude. Make sure the API server is running.';
        }
    }

    async waitForResponse(requestId) {
        // Not needed anymore - we get immediate response from API
        return 'API response should be immediate';
    }

    generateClaudeContext(userRequest) {
        const today = new Date().toISOString().split('T')[0];
        const recurringCount = this.taskManager.recurringTasks.length;
        const singleCount = this.taskManager.singleTasks.length;
        
        return `Hi Claude! I need help with my Schedule app. The task system has been refactored to save space.

## Current Status
- Date: ${today}
- Recurring tasks: ${recurringCount}
- Single tasks: ${singleCount}
- App has hot-reload (changes appear in 2 seconds)

## File Structure
- /home/chris/Schedule/recurring-tasks.json - Stores recurring task templates
- /home/chris/Schedule/single-tasks.json - Stores one-time tasks
- /home/chris/Schedule/task-completions.json - Stores completion states for recurring tasks

## Your Task
Process this request: "${userRequest}"

## Instructions
1. Read the appropriate JSON files
2. Make the requested changes immediately
3. Respond with what you did

## Task Format
For single tasks: id, title, type, date (YYYY-MM-DD), completed, startTime/endTime (optional)
For recurring tasks: id, title, type, startTime/endTime (optional), recurrence object with type (daily/weekly/monthly), interval, startDate

## Examples
- "Add lunch tomorrow" → Add to single-tasks.json
- "Add daily bedtime at 10pm" → Add to recurring-tasks.json with recurrence
- "Mark today's bedtime complete" → Update task-completions.json

Ready to edit the task files directly!`;
    }

    estimateTokens(text) {
        // More accurate token estimation based on Claude's tokenizer patterns
        // Claude uses roughly 3.5-4 characters per token for English text
        const baseTokens = Math.ceil(text.length / 3.7);
        
        // Adjust for word boundaries, punctuation, etc.
        const words = text.split(/\s+/).length;
        const punctuation = (text.match(/[.,!?;:()]/g) || []).length;
        
        // Claude tokenizer tends to split on punctuation and common prefixes
        const adjustedTokens = baseTokens + Math.ceil(punctuation / 2) + Math.ceil(words / 10);
        
        return Math.max(adjustedTokens, words); // Minimum of 1 token per word
    }

    buildContextWithHistory(currentMessage) {
        // Build recent conversation context
        let conversationContext = "";
        
        if (this.chatHistory.length > 0) {
            conversationContext = "\n\nRecent conversation:\n";
            this.chatHistory.slice(-6).forEach(msg => { // Last 6 messages for context
                conversationContext += `${msg.type === 'user' ? 'User' : 'Claude'}: ${msg.message}\n`;
            });
            conversationContext += `User: ${currentMessage}`;
        } else {
            conversationContext = currentMessage;
        }
        
        return conversationContext;
    }

    formatClaudeOutput(rawOutput) {
        // Escape HTML to prevent XSS and preserve formatting
        return rawOutput
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    renderMarkdown(text) {
        if (!text) return '';
        
        // Split by lines and process
        const lines = text.split('\n');
        let html = '';
        let inBulletList = false;
        let inNumberedList = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Check if this is a bullet point
            if (line.match(/^[•\-]\s+(.+)$/)) {
                if (!inBulletList) {
                    html += '<ul>';
                    inBulletList = true;
                }
                if (inNumberedList) {
                    html += '</ol>';
                    inNumberedList = false;
                }
                const content = line.replace(/^[•\-]\s+/, '');
                html += `<li>${content}</li>`;
            }
            // Check if this is a numbered list
            else if (line.match(/^(\d+)\.\s+(.+)$/)) {
                if (!inNumberedList) {
                    html += '<ol>';
                    inNumberedList = true;
                }
                if (inBulletList) {
                    html += '</ul>';
                    inBulletList = false;
                }
                const content = line.replace(/^(\d+)\.\s+/, '');
                html += `<li>${content}</li>`;
            }
            // Regular text
            else {
                if (inBulletList) {
                    html += '</ul>';
                    inBulletList = false;
                }
                if (inNumberedList) {
                    html += '</ol>';
                    inNumberedList = false;
                }
                if (line) {
                    // Convert **bold** to <strong>
                    const processedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                    html += processedLine;
                    if (i < lines.length - 1) html += '<br>';
                }
            }
        }
        
        // Close any open lists
        if (inBulletList) html += '</ul>';
        if (inNumberedList) html += '</ol>';
        
        return html;
    }

    addSidebarDragListeners() {
        // Add drag listeners to all sidebar task items
        this.tasksListEl.querySelectorAll('.task-item[draggable="true"]').forEach(taskEl => {
            taskEl.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', taskEl.getAttribute('data-task-id'));
                taskEl.classList.add('dragging');
            });
            
            taskEl.addEventListener('dragend', (e) => {
                taskEl.classList.remove('dragging');
            });
        });
    }

    addMonthDragAndDropListeners(dayEl) {
        // Make month calendar days drop zones for sidebar tasks
        dayEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            dayEl.classList.add('drop-target');
        });
        
        dayEl.addEventListener('dragleave', (e) => {
            if (!dayEl.contains(e.relatedTarget)) {
                dayEl.classList.remove('drop-target');
            }
        });
        
        dayEl.addEventListener('drop', (e) => {
            e.preventDefault();
            dayEl.classList.remove('drop-target');
            
            const taskId = e.dataTransfer.getData('text/plain');
            const newDate = dayEl.getAttribute('data-date');
            this.moveTaskToDate(taskId, newDate);
        });
    }

    // Mobile navigation functionality
    bindMobileEvents() {
        // Mobile navigation buttons
        document.getElementById('mobileTasksBtn')?.addEventListener('click', () => this.toggleMobileTasks());
        document.getElementById('mobileClaudeBtn')?.addEventListener('click', () => this.toggleMobileClaude());
        
        // Mobile panel close buttons
        document.getElementById('closeMobileTasksPanel')?.addEventListener('click', () => this.hideMobileTasks());
        document.getElementById('closeMobileClaudePanel')?.addEventListener('click', () => this.hideMobileClaude());
        
        // Mobile add task button
        document.getElementById('mobileAddTaskBtn')?.addEventListener('click', () => this.openTaskModal());
        
        // Mobile Claude chat
        document.getElementById('mobileSendBtn')?.addEventListener('click', () => this.sendMobileMessage());
        document.getElementById('mobileChatInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMobileMessage();
        });
        
        // Close panels when clicking overlay
        document.getElementById('mobileClaudeOverlay')?.addEventListener('click', (e) => {
            if (e.target.id === 'mobileClaudeOverlay') {
                this.hideMobileClaude();
            }
        });
    }

    toggleMobileTasks() {
        const panel = document.getElementById('mobileTasksPanel');
        if (panel?.classList.contains('show')) {
            this.hideMobileTasks();
        } else {
            this.showMobileTasks();
        }
    }

    toggleMobileClaude() {
        const overlay = document.getElementById('mobileClaudeOverlay');
        if (overlay?.classList.contains('show')) {
            this.hideMobileClaude();
        } else {
            this.showMobileClaude();
        }
    }

    showMobileTasks() {
        this.hideMobileClaude();
        document.getElementById('mobileTasksPanel')?.classList.add('show');
        this.renderMobileTasks();
        // Update mobile selected date
        document.getElementById('mobileSelectedDate').textContent = this.formatDate(this.selectedDate);
    }

    hideMobileTasks() {
        document.getElementById('mobileTasksPanel')?.classList.remove('show');
    }

    showMobileClaude() {
        this.hideMobileTasks();
        document.getElementById('mobileClaudeOverlay')?.classList.add('show');
        this.syncMobileChat();
    }

    hideMobileClaude() {
        document.getElementById('mobileClaudeOverlay')?.classList.remove('show');
    }

    renderMobileTasks() {
        const dayTasks = this.getTasksForDate(this.selectedDate);
        const mobileTasksList = document.getElementById('mobileTasksList');
        
        if (!mobileTasksList) return;
        
        if (dayTasks.length === 0) {
            mobileTasksList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">No tasks for this day</p>';
            return;
        }

        mobileTasksList.innerHTML = dayTasks.map(task => `
            <div class="task-item ${task.type || 'other'} ${task.completed ? 'completed' : ''}"
                 data-task-id="${task.id}">
                <div class="task-checkbox">
                    <input type="checkbox" id="mobile-task-check-${task.id}" ${task.completed ? 'checked' : ''} 
                           onchange="app.toggleTaskComplete('${task.id}')">
                </div>
                <div class="task-content">
                    ${task.type ? `<div class="task-type ${task.type}">${task.type}</div>` : ''}
                    <h4>${task.title} ${task.recurrenceId ? '<span class="recurrence-indicator" title="Recurring task">🔁</span>' : ''}</h4>
                    ${task.description ? `<div class="task-description">${this.renderMarkdown(task.description)}</div>` : ''}
                    ${task.startTime || task.endTime ? `<div class="task-time">${this.formatTimeRange(task.startTime, task.endTime)}</div>` : ''}
                </div>
                <div class="task-actions">
                    <button class="edit-btn" onclick="app.editTask('${task.id}')">✏️</button>
                    <button class="delete-btn" onclick="app.deleteTask('${task.id}')">🗑️</button>
                </div>
            </div>
        `).join('');
    }

    syncMobileChat() {
        const desktopMessages = document.getElementById('chatMessages');
        const mobileMessages = document.getElementById('mobileChatMessages');
        
        if (desktopMessages && mobileMessages) {
            mobileMessages.innerHTML = desktopMessages.innerHTML;
            mobileMessages.scrollTop = mobileMessages.scrollHeight;
        }
    }

    async sendMobileMessage() {
        const input = document.getElementById('mobileChatInput');
        const messages = document.getElementById('mobileChatMessages');
        const userMessage = input.value.trim();
        
        if (!userMessage) return;

        // Add user message to mobile chat
        const userDiv = document.createElement('div');
        userDiv.className = 'user-message';
        userDiv.innerHTML = `<strong>You:</strong> ${userMessage}`;
        messages.appendChild(userDiv);

        // Add to chat history
        this.chatHistory.push({type: 'user', message: userMessage});

        // Add loading indicator
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'claude-message thinking';
        loadingDiv.innerHTML = `<strong>Claude:</strong> Processing your request...`;
        messages.appendChild(loadingDiv);

        // Clear input and scroll
        input.value = '';
        messages.scrollTop = messages.scrollHeight;

        // Get response from Claude
        const response = await this.sendToBridge(Date.now().toString(), userMessage);
        
        // Replace loading with response
        loadingDiv.className = 'claude-message';
        loadingDiv.innerHTML = `<strong>Claude:</strong> ${response}`;

        // Add Claude response to chat history
        this.chatHistory.push({type: 'claude', message: response});
        
        // Keep only last 10 messages
        if (this.chatHistory.length > 10) {
            this.chatHistory = this.chatHistory.slice(-10);
        }

        // Sync back to desktop chat
        const desktopMessages = document.getElementById('chatMessages');
        if (desktopMessages) {
            desktopMessages.innerHTML = messages.innerHTML;
            desktopMessages.scrollTop = desktopMessages.scrollHeight;
        }

        messages.scrollTop = messages.scrollHeight;
    }
}

const app = new ScheduleApp();