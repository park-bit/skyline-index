import shutil
import subprocess
from pathlib import Path

import pytest


def test_assistant_node_suite():
    node_bin = shutil.which("node")
    if not node_bin:
        pytest.skip("node is not available on system")
    test_js = Path(__file__).parent / "test_assistant.js"
    assert test_js.exists(), "test_assistant.js not found"
    result = subprocess.run([node_bin, str(test_js)], capture_output=True, text=True, check=False)
    assert result.returncode == 0, f"Assistant test suite failed:\n{result.stdout}\n{result.stderr}"
