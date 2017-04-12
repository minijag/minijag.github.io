/*
|------------------------------------------|
| MelonHTML5 - Royal Preloader             |
|------------------------------------------|
| @author:  Lee Le (lee@melonhtml5.com)    |
| @version: 2.05 (05 March 2015)           |
| @website: www.melonhtml5.com             |
|------------------------------------------|
*/
/**
  (https://developer.mozilla.org/en-US/docs/DOM/document.cookie)
  docCookies.setItem(name, value[, end[, path[, domain[, secure]]]])
  docCookies.getItem(name)
  docCookies.removeItem(name[, path])
  docCookies.hasItem(name)
*/

var JQ = jQuery;
window.requestAnimFrame = function() {
    return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame || function(a) {
        window.setTimeout(a, 1E3 / 60)
    }
}();
window.transitionEnd = function(a, c) {
    var b = !1,
        d = document.createElement("div");
    JQ(["transition", "WebkitTransition", "MozTransition", "msTransition"]).each(function(a, c) {
        if (void 0 !== d.style[c]) return b = !0, !1
    });
    b ? a.bind("webkitTransitionEnd oTransitionEnd MSTransitionEnd transitionend", function(b) {
        a.unbind("webkitTransitionEnd oTransitionEnd MSTransitionEnd transitionend");
        c(b, a)
    }) : setTimeout(function() {
        c(null, a)
    }, 0);
    return a
};
var Royal_Preloader = {
    _overlay: null,
    _loader: null,
    _name: null,
    _percentage: null,
    _on_complete: null,
    _text_loader: null,
    _text_loader_overlay: null,
    _logo_loader: null,
    _logo_loader_meter: null,
    _total: 0,
    _loaded: 0,
    _image_queue: [],
    _percentage_loaded: 0,
    _mode: "number",
    _text: "loading...",
    _text_colour: "#FFFFFF",
    _images: [],
    _show_progress: !0,
    _show_percentage: !0,
    _background: "#000000",
    _logo: "",
    _logo_size: [80, 80],
    _timeout: 10,
    _init: function() {
        Royal_Preloader._build();
    },
    _build: function() {
        this._overlay = JQ("#royal_preloader");
        this._overlay.length || (this._overlay = JQ("<div>").attr("id",
            "royal_preloader").prependTo(JQ(document.body)));

        this._overlay.appendTo(JQ(document.body));
    },
    _load: function() {
        Royal_Preloader._loadFinish()
    },
};
