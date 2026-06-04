#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from efffieldpy.constants import DEFAULT_GMRES_TOL
from efffieldpy.examples.structure import StructureSpec, generate_struct_in
from efffieldpy.io.loader import load_parameter
from efffieldpy.io.struct_reader import read_structure
from efffieldpy.io.writers import write_distribution_result, write_effective_result
from efffieldpy.solvers.effective import compute_effective, solve_distribution_for_config


def run_case(case_dir: Path, tol: float, maxiter: int, output_dir: Path | None = None) -> None:
    directory = case_dir.resolve()
    if not directory.is_dir():
        raise FileNotFoundError(f"case directory does not exist: {directory}")
    struct_path = directory / "struct.in"
    if not struct_path.exists():
        raise FileNotFoundError(f"missing required structure file: {struct_path}")
    destination = (output_dir or directory / "output").resolve()
    destination.mkdir(parents=True, exist_ok=True)
    config = load_parameter(directory)
    structure = read_structure(struct_path, config)
    effective = compute_effective(config, structure, tol=tol, maxiter=maxiter)
    write_effective_result(destination, effective)
    if config.outdist:
        distribution = solve_distribution_for_config(
            config,
            structure,
            tol=tol,
            maxiter=maxiter,
            effective_result=effective,
        )
        write_distribution_result(destination, distribution)
    print(f"efffield-runner: wrote outputs to {destination}")


def generate_struct(args: argparse.Namespace) -> None:
    radii = None
    if args.rx is not None or args.ry is not None or args.rz is not None:
        if args.rx is None or args.ry is None:
            raise ValueError("--rx and --ry must be provided together")
        radii = (args.rx, args.ry, 1.0 if args.rz is None else args.rz)
    path = generate_struct_in(
        args.case_dir,
        StructureSpec(
            nx=args.nx,
            ny=args.ny,
            nz=args.nz,
            inclusion_shape=args.shape,
            radius=args.radius,
            radii=radii,
            matrix_phase=1,
            inclusion_phase=2,
        ),
    )
    print(f"efffield-runner: wrote structure to {path.resolve()}")


def main() -> None:
    parser = argparse.ArgumentParser(description="CLI-free efffieldpy adapter for PFM2 WebUI")
    sub = parser.add_subparsers(dest="command", required=True)

    gen = sub.add_parser("generate-struct")
    gen.add_argument("case_dir", type=Path)
    gen.add_argument("--nx", type=int, required=True)
    gen.add_argument("--ny", type=int, required=True)
    gen.add_argument("--nz", type=int, default=1)
    gen.add_argument("--shape", default="circle")
    gen.add_argument("--radius", type=float)
    gen.add_argument("--rx", type=float)
    gen.add_argument("--ry", type=float)
    gen.add_argument("--rz", type=float)

    run = sub.add_parser("run")
    run.add_argument("case_dir", type=Path)
    run.add_argument("--tol", type=float, default=DEFAULT_GMRES_TOL)
    run.add_argument("--maxiter", type=int, default=1000)
    run.add_argument("--output-dir", type=Path)

    args = parser.parse_args()
    if args.command == "generate-struct":
        generate_struct(args)
    elif args.command == "run":
        run_case(args.case_dir, args.tol, args.maxiter, args.output_dir)


if __name__ == "__main__":
    main()
