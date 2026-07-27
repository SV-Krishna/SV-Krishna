# Project-local OpenSCAD

Run `./install.sh` to download `OpenSCAD-2021.01-x86_64.AppImage`, the official
stable Linux AppImage from <https://openscad.org/downloads.html>.

The accompanying checksum file is the official SHA-256 file. It contains the
upstream `releases/` path prefix; the downloaded binary was verified manually:

```text
f758528f2cd213f773c7a105fb63bf3b45bf754b0f586fbb7c9cd653ffcd0882
```

The third-party executable is ignored by Git. The installer verifies its
fixed SHA-256 checksum before use. On systems without FUSE, run it with
`APPIMAGE_EXTRACT_AND_RUN=1`.
