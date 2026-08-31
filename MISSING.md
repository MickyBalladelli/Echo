# Missing Prism components

Audit scope: every frontend file in `portal/src`. Matrix is the only frontend runtime, and Prism is used for every available UI control and surface.

## Needed in Prism

### `TextArea`

Prism has `TextField`, but it renders a single-line `<input>`. Echo still needs a themed, signal-bound multiline control for:

- post and reply composers
- notes
- chat and channel chat
- moderation reports and appeals
- profile, channel, and post editing

Expected support: Matrix signal binding, `maxLength`, `rows`, `placeholder`, `required`, disabled/read-only state, `ariaLabel`, descriptions, validation error state, and input/change events.

### `FileField` or `ImagePicker`

Prism has `ColorPicker`, but no accessible generic file or image picker. Echo still uses native file inputs for:

- post images
- profile avatars
- profile banners

Expected support: accepted MIME types, multiple-file policy, disabled state, accessible label, native file event access, and a clearable selection state. Image resizing and upload/storage policy stay in Echo feature code.

### `Media`

Prism has `Avatar`, but no general themed media component. Echo still uses native `<img>` for post media, channel images, banners, and previews. A future component should cover loading, broken-image fallback, alt text, aspect ratio, object fit, and responsive sizing.

## Not missing

- Native `<a>` remains for real links because Prism has no link component; Matrix router interception handles SPA navigation.
- Native `<form>`, headings, paragraphs, lists, time elements, and structural containers remain semantic HTML.
- `Select`, `DateTimePicker`, `TextField`, `CheckBox`, `Button`, `Avatar`, `Card`, `FormField`, and feedback/layout components are available from Prism and used through `portal/src/lib/vendor.js`.

Do not create local replacement components for the three gaps above. Add them to Prism first, then migrate the remaining native controls and media.
