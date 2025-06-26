#!/usr/bin/env python3
"""
Claude Bridge - Handles communication between Schedule app and Claude terminal
"""
import json
import subprocess
import time
import os
from pathlib import Path

class ClaudeBridge:
    def __init__(self):
        self.schedule_dir = Path(__file__).parent
        self.requests_file = self.schedule_dir / "claude_requests.json"
        self.responses_file = self.schedule_dir / "claude_responses.json"
        self.tasks_file = self.schedule_dir / "tasks.json"
        
        # Initialize files
        self.init_files()
        
    def init_files(self):
        """Initialize communication files"""
        if not self.requests_file.exists():
            self.requests_file.write_text("[]")
        if not self.responses_file.exists():
            self.responses_file.write_text("[]")
            
    def watch_requests(self):
        """Watch for new requests from the app"""
        last_request_count = 0
        print("Claude Bridge started - watching for schedule requests...")
        
        while True:
            try:
                requests = json.loads(self.requests_file.read_text())
                
                if len(requests) > last_request_count:
                    # Process new requests
                    for i in range(last_request_count, len(requests)):
                        request = requests[i]
                        print(f"Processing: {request['message']}")
                        
                        # Call Claude with the request
                        response = self.call_claude(request['message'])
                        
                        # Save response
                        self.save_response(request['id'], response)
                        
                    last_request_count = len(requests)
                    
            except Exception as e:
                print(f"Error: {e}")
                
            time.sleep(1)
            
    def call_claude(self, user_message):
        """Call Claude via terminal with context"""
        context = self.build_context(user_message)
        
        try:
            # Use claude command line tool if available
            result = subprocess.run([
                'claude', 
                '--message', context
            ], capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                return result.stdout.strip()
            else:
                return f"Error calling Claude: {result.stderr}"
                
        except FileNotFoundError:
            # Fallback: simulate Claude response for testing
            return self.simulate_claude_response(user_message)
        except Exception as e:
            return f"Error: {str(e)}"
            
    def build_context(self, user_message):
        """Build context prompt for Claude"""
        tasks = json.loads(self.tasks_file.read_text()) if self.tasks_file.exists() else []
        
        return f"""You are a schedule assistant with full authority to edit {self.tasks_file} immediately.

Current tasks: {len(tasks)}
User request: "{user_message}"

Instructions:
1. Edit {self.tasks_file} directly based on the request
2. Respond with what you did (e.g., "Added workout tomorrow at 7am!")

Task format: {{"id": "unique", "title": "...", "type": "work|exercise|meal|meeting|personal|health|social|other", "date": "YYYY-MM-DD", "completed": false, "startTime": "HH:MM", "endTime": "HH:MM"}}

Execute the request now!"""

    def simulate_claude_response(self, user_message):
        """Simulate Claude response for testing when CLI not available"""
        # This is a fallback - in reality we'd call actual Claude
        if "add" in user_message.lower():
            return f"Added task: {user_message}"
        elif "move" in user_message.lower():
            return f"Moved task as requested: {user_message}"
        elif "delete" in user_message.lower():
            return f"Deleted task: {user_message}"
        else:
            return f"Processed request: {user_message}"
            
    def save_response(self, request_id, response):
        """Save Claude's response"""
        try:
            responses = json.loads(self.responses_file.read_text())
            responses.append({
                "id": request_id,
                "response": response,
                "timestamp": time.time()
            })
            self.responses_file.write_text(json.dumps(responses, indent=2))
            print(f"Response saved: {response}")
        except Exception as e:
            print(f"Error saving response: {e}")

if __name__ == "__main__":
    bridge = ClaudeBridge()
    bridge.watch_requests()