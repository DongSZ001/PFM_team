# Domain Assets

This directory is reserved for non-runtime domain resources used by future PF Assistant modules.

It intentionally keeps research assets outside the backend runtime folder so service code, SQLite data, logs, and scientific resources do not become mixed together.

Current planned layout:

~~~text
domain-assets/
  parameters/
    ferromagnetic/
    ferroelectric/
    piezoelectric/
    dielectric/
  examples/
  scales/
    ferromagnetic/
    ferroelectric/
~~~

Round 16 only creates the structure. Actual parameter files, example scripts, and scale files should be moved in a later round after their file formats and runtime dependencies are audited.
