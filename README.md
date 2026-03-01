# Commission Index

Don't look.

Personal use only

## Image Strategy (Static Export)

- Keep `output: 'export'` and static image delivery.
- Commission images use responsive variants: `<name>.webp`, `<name>-960.webp`, `<name>-1280.webp`.
- Listing image markup uses `srcset` (`960w`, `1280w`) and `sizes="(max-width: 768px) 92vw, 640px"`.
- `-640.webp` is intentionally not generated for now.

### Variant Tuning Rule

- Track `commission_image_variant_loaded` analytics event for loaded variant distribution.
- Revisit adding a sub-960 variant only if mobile `-1280.webp` usage stays high for an extended period.
- Otherwise keep the current two-tier setup to reduce pipeline and asset complexity.
