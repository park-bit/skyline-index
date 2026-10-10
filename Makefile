.PHONY: install download panel model-table train test all

install:
	pip install -r requirements.txt

download:
	python scripts/01_download.py

panel:
	python scripts/02_build_panel.py

model-table:
	python scripts/03_build_model_table.py

train:
	jupyter nbconvert --to notebook --execute --inplace training_notebook.ipynb

test:
	pytest -v

all: download panel model-table train test
