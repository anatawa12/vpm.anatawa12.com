# vpm.anatawa12.com
domain for vpm

## Planned site structure

- `vpm.anatawa12.com/`
  - `vpm.json` - the vpm version manifest. Will be generated with `if test -f vpm.src.json; then jq -c . < vpm.src.json > vpm.json; fi` command at the build time.
  - `vpm.src.json` - original vpm json file
  - `<package-id-w/o-com.anatawa12>/` - the folder for one package
    - `package-<version>.zip` - redirects to github release asset
    - `doc/` - documentation

