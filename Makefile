.PHONY: install download panel test all

install:
	pip install -r requirements.txt

download:
	python scripts/01_download.py

panel:
	python scripts/02_build_panel.py

test:
	pytest -v

all: download panel test
