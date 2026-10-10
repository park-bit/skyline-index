import nbformat
import pytest
from nbclient import NotebookClient

from src.config import PROCESSED, ROOT


def test_notebook_executes_successfully():
    panel_path = PROCESSED / "airport_year_panel.parquet"
    if not panel_path.exists():
        pytest.skip("data/processed inputs missing (run scripts/01_download.py and scripts/02_build_panel.py)")

    nb_path = ROOT / "training_notebook.ipynb"
    assert nb_path.exists(), "training_notebook.ipynb missing from repo root"

    nb = nbformat.read(nb_path, as_version=4)
    client = NotebookClient(nb, timeout=1200, resources={"metadata": {"path": str(ROOT)}})
    client.execute()
