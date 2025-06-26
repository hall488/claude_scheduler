#!/usr/bin/env python3
"""
API Server with integrated Claude for Schedule app
"""
import json
import subprocess
import time
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import threading
from pathlib import Path

class ScheduleAPIHandler(BaseHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        self.schedule_dir = Path(__file__).parent
        self.tasks_file = self.schedule_dir / "tasks.json"
        super().__init__(*args, **kwargs)
    
    def do_GET(self):
        """Handle GET requests"""
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/api/claude':
            # Handle Claude chat request
            query_params = parse_qs(parsed_path.query)
            message = query_params.get('message', [''])[0]
            
            if message:
                response = self.process_claude_request(message)
                self.send_json_response({"response": response})
            else:
                self.send_json_response({"error": "No message provided"})
        else:
            self.send_error(404)
    
    def do_POST(self):
        """Handle POST requests"""
        if self.path == '/api/claude':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                message = data.get('message', '')
                
                if message:
                    response = self.process_claude_request(message)
                    self.send_json_response({"response": response})
                else:
                    self.send_json_response({"error": "No message provided"})
            except json.JSONDecodeError:
                self.send_json_response({"error": "Invalid JSON"})
        elif self.path == '/api/save-tasks':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                tasks = data.get('tasks', [])
                source = data.get('source', 'user')  # Track who is making the change
                
                # Write tasks directly to file
                self.tasks_file.write_text(json.dumps(tasks, indent=2))
                self.send_json_response({"success": True, "message": "Tasks saved successfully", "source": source})
                print(f"Saved {len(tasks)} tasks to file (source: {source})")
                
            except json.JSONDecodeError:
                self.send_json_response({"error": "Invalid JSON"})
            except Exception as e:
                print(f"Error saving tasks: {e}")
                self.send_json_response({"error": f"Failed to save tasks: {e}"})
        else:
            self.send_error(404)
    
    def process_claude_request(self, user_message):
        """Process request through Claude terminal"""
        print(f"Processing Claude request: {user_message}")
        
        try:
            # Call Claude directly with context
            initial_context = f"""You are integrated into a Schedule app. Edit {self.tasks_file} directly based on user requests.

Task format: {{"id": "claude_timestamp", "title": "Task Name", "description": "Brief markdown description with **bold** and bullet points", "type": "work|exercise|meal|meeting|personal|health|social|other", "date": "YYYY-MM-DD", "completed": false, "startTime": "HH:MM", "endTime": "HH:MM"}}

Current date: 2025-06-26, Tomorrow: 2025-06-27

For descriptions, use:
- **Bold** for key info
- • Bullet points for lists
- Keep it concise but helpful

User request: {user_message}

Execute now and respond briefly with what you did:"""

            # Call Claude directly with context using communicate()
            process = subprocess.Popen([
                'claude', '--dangerously-skip-permissions'
            ], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, 
               cwd=self.schedule_dir.parent)
            
            try:
                # Send the context and get the output
                full_output, _ = process.communicate(input=initial_context, timeout=120)
                
                print(f"Claude output: {full_output}")
                return full_output.strip()
                
            except subprocess.TimeoutExpired:
                process.kill()
                return "Claude request timed out"
                
        except Exception as e:
            print(f"Error calling Claude: {e}")
            return f"Error communicating with Claude: {e}"
    
    def build_claude_context(self, user_message):
        """Build context prompt for Claude"""
        try:
            tasks = json.loads(self.tasks_file.read_text()) if self.tasks_file.exists() else []
        except:
            tasks = []
        
        return f"""You are a schedule assistant with full authority to edit {self.tasks_file} immediately without asking for approval.

Current tasks: {len(tasks)}
User request: "{user_message}"

Instructions:
1. Read the current tasks from {self.tasks_file}
2. Edit the file directly based on the user's request
3. Respond ONLY with what you did (e.g., "Added workout tomorrow at 7am!")

Task format: {{"id": "claude_" + timestamp, "title": "...", "type": "work|exercise|meal|meeting|personal|health|social|other", "date": "YYYY-MM-DD", "completed": false, "startTime": "HH:MM", "endTime": "HH:MM"}}

Current date: 2025-06-26
Tomorrow: 2025-06-27

Execute the request immediately and respond with what you did!"""

    def simulate_claude_response(self, user_message):
        """Actually process and execute the user's request"""
        import time
        
        # Load current tasks
        try:
            tasks = json.loads(self.tasks_file.read_text()) if self.tasks_file.exists() else []
        except:
            tasks = []
        
        message_lower = user_message.lower()
        
        # ADD COMMANDS
        if "add" in message_lower:
            task_id = f"claude_{int(time.time())}"
            
            # Parse what to add
            if "coffee" in message_lower:
                title = "Coffee ☕"
                task_type = "personal"
                start_time = "07:30"
                end_time = "08:00"
            elif "lunch" in message_lower:
                title = "Lunch"
                task_type = "meal"
                start_time = "12:00"
                end_time = "13:00"
            elif "dinner" in message_lower:
                title = "Dinner"
                task_type = "meal"
                start_time = "18:00"
                end_time = "19:00"
            elif "workout" in message_lower:
                title = "Workout 💪"
                task_type = "exercise"
                start_time = "07:00"
                end_time = "08:00"
            elif "meeting" in message_lower:
                title = "Meeting"
                task_type = "meeting"
                start_time = "10:00"
                end_time = "11:00"
            else:
                # Generic task
                words = user_message.split()
                if len(words) > 1:
                    title = " ".join(words[1:]).title()
                else:
                    title = "New Task"
                task_type = "other"
                start_time = None
                end_time = None
            
            # Parse time if specified
            if "at" in message_lower:
                words = user_message.split()
                for i, word in enumerate(words):
                    if word.lower() == "at" and i + 1 < len(words):
                        time_str = words[i + 1].replace("pm", "").replace("am", "")
                        try:
                            hour = int(time_str)
                            if "pm" in words[i + 1] and hour != 12:
                                hour += 12
                            elif "am" in words[i + 1] and hour == 12:
                                hour = 0
                            start_time = f"{hour:02d}:00"
                            end_time = f"{(hour + 1) % 24:02d}:00"
                        except ValueError:
                            pass
            
            # Parse date
            date = "2025-06-26"  # today
            if "tomorrow" in message_lower:
                date = "2025-06-27"
            elif "27" in user_message or "june 27" in message_lower:
                date = "2025-06-27"
            elif "28" in user_message or "june 28" in message_lower:
                date = "2025-06-28"
            elif "29" in user_message or "june 29" in message_lower:
                date = "2025-06-29"
            
            # Create task
            task = {
                "id": task_id,
                "title": title,
                "type": task_type,
                "date": date,
                "completed": False
            }
            
            if start_time:
                task["startTime"] = start_time
            if end_time:
                task["endTime"] = end_time
                
            tasks.append(task)
            self.tasks_file.write_text(json.dumps(tasks, indent=2))
            
            date_text = "today" if date == "2025-06-26" else ("tomorrow" if date == "2025-06-27" else f"on {date}")
            time_text = f" at {start_time}" if start_time else ""
            return f"Added '{title}' {date_text}{time_text}!"
        
        # MOVE COMMANDS
        elif "move" in message_lower:
            # Find task to move
            task_to_move = None
            for task in tasks:
                if any(word in task["title"].lower() for word in ["coffee", "lunch", "dinner", "workout"]):
                    if any(word in message_lower for word in task["title"].lower().split()):
                        task_to_move = task
                        break
            
            if task_to_move:
                # Parse new date/time
                if "tomorrow" in message_lower:
                    task_to_move["date"] = "2025-06-27"
                elif "27" in user_message:
                    task_to_move["date"] = "2025-06-27"
                elif "28" in user_message:
                    task_to_move["date"] = "2025-06-28"
                
                if "at" in message_lower:
                    words = user_message.split()
                    for i, word in enumerate(words):
                        if word.lower() == "at" and i + 1 < len(words):
                            time_str = words[i + 1].replace("pm", "").replace("am", "")
                            try:
                                hour = int(time_str)
                                if "pm" in words[i + 1] and hour != 12:
                                    hour += 12
                                task_to_move["startTime"] = f"{hour:02d}:00"
                            except ValueError:
                                pass
                
                self.tasks_file.write_text(json.dumps(tasks, indent=2))
                return f"Moved '{task_to_move['title']}' to {task_to_move['date']}!"
            else:
                return "Couldn't find that task to move."
        
        # DELETE COMMANDS
        elif "delete" in message_lower or "remove" in message_lower:
            original_count = len(tasks)
            
            if "test" in message_lower:
                tasks = [t for t in tasks if "test" not in t["title"].lower()]
            elif "coffee" in message_lower:
                tasks = [t for t in tasks if "coffee" not in t["title"].lower()]
            else:
                # Delete by partial title match
                words = user_message.split()
                for word in words:
                    if word.lower() not in ["delete", "remove", "the"]:
                        tasks = [t for t in tasks if word.lower() not in t["title"].lower()]
            
            deleted_count = original_count - len(tasks)
            if deleted_count > 0:
                self.tasks_file.write_text(json.dumps(tasks, indent=2))
                return f"Deleted {deleted_count} task(s)!"
            else:
                return "No matching tasks found to delete."
        
        # TEST COMMAND
        elif "test" in message_lower:
            return "Claude integration is working! Try: 'add coffee tomorrow', 'move workout to 6pm', 'delete test task'"
        
        else:
            return f"I don't understand '{user_message}'. Try: 'add [item] [date] [time]', 'move [item] to [date/time]', or 'delete [item]'"
    
    def send_json_response(self, data):
        """Send JSON response with CORS headers"""
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        
        response = json.dumps(data)
        self.wfile.write(response.encode())
    
    def do_OPTIONS(self):
        """Handle preflight CORS requests"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

def run_api_server(port=8001, host='0.0.0.0'):
    """Run the API server"""
    server_address = (host, port)
    httpd = HTTPServer(server_address, ScheduleAPIHandler)
    print(f"Claude API server running on:")
    print(f"  Local: http://localhost:{port}")
    print(f"  Network: http://10.0.0.43:{port}")
    httpd.serve_forever()

if __name__ == "__main__":
    run_api_server()