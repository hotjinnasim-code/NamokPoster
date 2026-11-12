"""Soft 3D Scenery — one technique (soft matte forms in pastel light), several subjects.
The motif chooses the subject; each lives in its own module beside this file."""
import importlib.util
import os

HERE = os.path.dirname(os.path.abspath(__file__))
MOTIFS = ('lake', 'dunes', 'room', 'clouds')


def _load(name):
    spec = importlib.util.spec_from_file_location('softscape_' + name, os.path.join(HERE, name + '.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def build(ctx):
    motif = str((getattr(ctx, 'params', None) or {}).get('motif', 'lake'))
    _load(motif if motif in MOTIFS else 'lake').build(ctx)
