class BaseAddon {
  activate() {}
  dispose() {}
}

class FitAddon extends BaseAddon {}
class WebLinksAddon extends BaseAddon {}
class WebglAddon extends BaseAddon {}

module.exports = { FitAddon, WebLinksAddon, WebglAddon };
