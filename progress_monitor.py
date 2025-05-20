import os
import json
import time
from typing import Dict, Any, List, Optional
import signal
import sys
import atexit

class ProgressMonitor:
    """
    A robust class for monitoring and controlling long-running processes.
    Uses files for progress reporting and process control.
    """
    
    def __init__(self, process_id: str = "outreach"):
        """Initialize with a unique process ID to prevent conflicts."""
        self.process_id = process_id
        self.progress_file = f"{process_id}_progress.json"
        self.control_file = f"{process_id}_control.json"
        self.logs: List[Dict[str, Any]] = []
        self.last_progress: Dict[str, Any] = {
            "stage": "init",
            "message": "Initializing...",
            "percent": 0,
            "timestamp": time.time(),
            "is_running": True
        }
        
        # Initialize files
        self._init_files()
        
        # Set up signal handlers for clean shutdown
        signal.signal(signal.SIGINT, self._handle_exit)
        signal.signal(signal.SIGTERM, self._handle_exit)
        atexit.register(self._handle_exit)
    
    def _init_files(self) -> None:
        """Initialize the progress and control files."""
        # Create progress file
        self._write_progress_file()
        
        # Create control file if it doesn't exist
        if not os.path.exists(self.control_file):
            with open(self.control_file, 'w') as f:
                json.dump({
                    "command": "run",
                    "timestamp": time.time()
                }, f)
    
    def _write_progress_file(self) -> None:
        """Write the current progress to the progress file."""
        data = {
            "progress": self.last_progress,
            "logs": self.logs[-100:],  # Keep only the last 100 logs
            "timestamp": time.time()
        }
        
        # Write to a temp file first and then rename to avoid partial reads
        temp_file = f"{self.progress_file}.tmp"
        with open(temp_file, 'w') as f:
            json.dump(data, f)
        
        # Atomic rename
        os.replace(temp_file, self.progress_file)
    
    def _check_control_file(self) -> str:
        """Check the control file for commands."""
        try:
            if os.path.exists(self.control_file):
                with open(self.control_file, 'r') as f:
                    control_data = json.load(f)
                    return control_data.get("command", "run")
            return "run"
        except Exception as e:
            print(f"Error reading control file: {e}")
            return "run"
    
    def _handle_exit(self, *args) -> None:
        """Handle process exit by updating the progress file."""
        self.last_progress["is_running"] = False
        self.last_progress["stage"] = "stopped"
        self.last_progress["message"] = "Process was stopped"
        self._write_progress_file()
        sys.exit(0)
    
    def log(self, message: str, level: str = "info") -> None:
        """Add a log message."""
        log_entry = {
            "message": message,
            "level": level,
            "timestamp": time.time()
        }
        self.logs.append(log_entry)
        self._write_progress_file()
        
        # Also print to console for debugging
        print(f"[{level.upper()}] {message}")
    
    def update_progress(self, stage: str, message: str, percent: float = None, data: Dict[str, Any] = None) -> None:
        """Update the progress with new information."""
        # If percent is not provided, try to calculate based on stage
        if percent is None:
            stages = ["init", "start", "hashtags", "profiles", "emails", "browser", "complete"]
            try:
                stage_index = stages.index(stage)
                percent = (stage_index / (len(stages) - 1)) * 100
            except ValueError:
                percent = 0
        
        # Clean up the stage name for better display - remove _detail suffixes
        display_stage = stage
        if stage.endswith('_detail'):
            display_stage = stage.split('_')[0]
        
        # Include percent in data for frontend use
        if data is None:
            data = {}
        data['percent'] = percent
        
        self.last_progress = {
            "stage": display_stage,  # Use the cleaned stage name
            "message": message,
            "percent": percent,
            "data": data,
            "timestamp": time.time(),
            "is_running": True
        }
        
        # Add this as a log entry too
        self.log(message, level=stage)
        
        # Write to file
        self._write_progress_file()
    
    def should_stop(self) -> bool:
        """Check if the process should stop based on control file."""
        command = self._check_control_file()
        return command == "stop"
    
    def mark_complete(self, message: str = "Process completed", data: Dict[str, Any] = None) -> None:
        """Mark the process as completed."""
        self.update_progress("complete", message, 100, data)
        self.last_progress["is_running"] = False
        self._write_progress_file()
    
    def mark_failed(self, message: str = "Process failed", data: Dict[str, Any] = None) -> None:
        """Mark the process as failed."""
        self.update_progress("error", message, 100, data)
        self.last_progress["is_running"] = False
        self._write_progress_file()
        
    def clear_logs(self) -> None:
        """Clear the log history."""
        self.logs = []
        self._write_progress_file()

# Function to get a singleton instance
_monitor_instance = None

def get_monitor(process_id: str = "outreach") -> ProgressMonitor:
    """Get a singleton instance of the progress monitor."""
    global _monitor_instance
    if _monitor_instance is None:
        _monitor_instance = ProgressMonitor(process_id)
    return _monitor_instance