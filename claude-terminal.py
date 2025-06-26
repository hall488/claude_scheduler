#!/usr/bin/env python3
"""
Claude Terminal Bridge - Spawns actual Claude terminal and communicates with it
"""
import subprocess
import threading
import time
import json
from pathlib import Path

class ClaudeTerminal:
    def __init__(self):
        self.schedule_dir = Path(__file__).parent
        self.tasks_file = self.schedule_dir / "tasks.json"
        self.claude_process = None
        self.setup_claude()
        
    def setup_claude(self):
        """Initialize Claude context"""
        self.initial_context = f"""You are integrated into a Schedule app. You have full authority to edit {self.tasks_file} immediately without asking for approval.

Your job: When users ask you to modify their schedule, you edit the tasks.json file directly and respond with what you did.

Task format: {{"id": "claude_timestamp", "title": "...", "type": "work|exercise|meal|meeting|personal|health|social|other", "date": "YYYY-MM-DD", "completed": false, "startTime": "HH:MM", "endTime": "HH:MM"}}

Current date: 2025-06-26
Tomorrow: 2025-06-27

Examples:
- "add workout tomorrow" → Add exercise task for 2025-06-27, respond "Added workout tomorrow!"
- "create workout plan for next week" → Add multiple exercise tasks across the week
- "move coffee to 8am" → Find coffee task, change startTime, respond with what you did

You have access to read and edit files. Always respond with what you accomplished, not what you're going to do.

Ready to help with schedule management!

"""
        print("Claude context prepared")
    
    def process_request(self, user_message):
        """Process user request through Claude using --print mode"""
        try:
            # Combine context with user message
            full_prompt = self.initial_context + f"\n\nUser request: {user_message}\n\nExecute this request now and respond with what you accomplished:"
            
            # Call Claude with --print for non-interactive output
            result = subprocess.run([
                'claude', '--print', '--dangerously-skip-permissions', full_prompt
            ], capture_output=True, text=True, timeout=30, cwd=self.schedule_dir)
            
            if result.returncode == 0:
                response = result.stdout.strip()
                print(f"Claude response: {response}")
                return response
            else:
                error = result.stderr.strip()
                print(f"Claude error: {error}")
                return f"Claude error: {error}"
                
        except subprocess.TimeoutExpired:
            return "Claude took too long to respond."
        except Exception as e:
            print(f"Error calling Claude: {e}")
            return f"Error calling Claude: {e}"
        
    def cleanup(self):
        """Clean up Claude process"""
        if self.claude_process:
            self.claude_process.terminate()
            self.claude_process.wait()

# Global instance
claude_terminal = None

def get_claude_terminal():
    global claude_terminal
    if not claude_terminal:
        claude_terminal = ClaudeTerminal()
    return claude_terminal