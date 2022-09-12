class Web2Cit {
  static disabledItem = 'web2cit.disabled';

  constructor() {
    this.unpatched = {};
    this.initialized = false;
    // this.mode = undefined;
  }

  get disabled() {
    return localStorage.getItem(this.disabledItem) === "true";
    // if (this.mode === "visual") {
    //   return localStorage.getItem(this.disabledItem) === "true";
    // } else {
    //   return false;
    // }    
  }

  set disabled(disabled) {
    localStorage.setItem(this.disabledItem, disabled === "true");
    // if (this.mode === "visual") {
    //   localStorage.setItem(this.disabledItem, disabled === "true");
    // } else {
    //   throw Error(`Cannot disable in ${this.mode} mode`);
    // }
  }

  init() {
    if (this.initialized) return;
    console.log('Web2Cit: Initializing...');
    this.patchInitialize();
    if(!this.disabled) this.enable();
    this.initialized = true;
    // const surface = ve.init.target.getSurface();
    // this.mode = surface.getMode();
    // if (this.mode === "visual") {
    //   this.patchInitialize();
    // }
    // if (!this.disabled || this.mode === "source") {
    //   this.enable();
    // }
  }

  enable() {
    console.log("Web2Cit: Enabling...");
    this.patchAjax();
    this.patchBuildTemplateResults();
    // if (this.mode === "visual") {
    //   this.patchBuildTemplateResults();
    // };
  }

  disable() {
    console.log("Web2Cit: Disabling...");
    this.unpatchAjax();
    this.unpatchBuildTemplateResults();
    // if (this.mode === "visual") {
    //   this.unpatchBuildTemplateResults();
    // }
  }

  patchInitialize () {
    // console.log("Web2Cit: Patching CitoidInspector's \"initalize\"...")
    const initialize = ve.ui.CitoidInspector.prototype.initialize;
    // const toggle = new OO.ui.ToggleSwitchWidget({
    //   value: !this.disabled
    // });
    const toggle = new OO.ui.CheckboxInputWidget({
      selected: !this.disabled,
    });
    const field = new OO.ui.FieldLayout( toggle, {
      align: 'inline',
      label: 'Web2Cit'
    } );
    toggle.on("change", (value) => {
      if (value) {
        this.disabled = false;
        this.enable();
      } else {
        this.disabled = true;
        this.disable();
      }
    });
    ve.ui.CitoidInspector.prototype.initialize = function () {
      initialize.bind(this)();
      const parentElement = this.autoProcessPanels.lookup.$element;
      field.$element.insertAfter(parentElement.children().first());
    }
  }

  patchAjax() {
    if (this.unpatched.ajax) return;
    // console.log("Web2Cit: Patching ajax...")
    const ajax = $.ajax;
    this.unpatched.ajax = ajax;
    $.ajax = function(url, options) {
      // If url is an object, simulate pre-1.5 signature
      if ( typeof url === "object" ) {
        options = url;
        url = undefined;
      }
      // Force options to be an object
      options = options || {};
      
      url = url || options.url;
      const match = url.match(
        /^\/api\/rest_v1\/data\/citation\/mediawiki\/(?<search>.+)/
      );
      if (match !== null) {
        let { search } = match.groups;
        search = decodeURIComponent(search);
        
        // mimick citoid's CitoidService.js
        search = search.trim()//.toLowerCase();
  
        // if the query does not begin with either http:// or https://
        // only assume that the user meant a url if it follows the pattern
        // www.something.somethingelse
        // otherwise, we may miss DOIs, QIDs, PMCIDs, ISBNs or PMIDs
        // which are handled by Citoid differently
        // instruct the user to always add http:// or https:// at the beginning
        // to explicitly mean a url
        if (search.match(/^www\..+\..+/i)) {
          search = "http://" + search;
        };
        if (
          search.match(/^https?:\/\/.+/i) &&
          // to prevent an endless loop, continue using web2cit through citoid
          // if user explicitly asks to translate a web2cit url
          !search.match(/^https?:\/\/web2cit.toolforge.org\/.+/i)
        ) {
          console.log('Web2Cit: Search will be resolved using Web2Cit + Citoid...')
          url = "https://web2cit.toolforge.org/translate";
          options.data = {
            "citoid": "true",
            "format": "mediawiki",
            "url": search
          };
        }
      }
      return ajax.bind(this)(url, options);
    }  
  }

  patchBuildTemplateResults() {
    if (this.unpatched.buildTemplateResults) return;
    // console.log("Web2Cit: Patching CitoidInspector's \"buildTemplateResults\"...");
    const buildTemplateResults = ve.ui.CitoidInspector.prototype.buildTemplateResults;
    this.unpatched.buildTemplateResults = buildTemplateResults
    ve.ui.CitoidInspector.prototype.buildTemplateResults = function( searchResults ) {
      let url;
      let web2cit = false;
      for (const citation of searchResults) {
        let { source } = citation;
        if (source !== undefined) {
          if (!Array.isArray(source)) source = [ source ];
          if (source.includes('Web2Cit')) {
            url = citation.url;
            web2cit = true;
            break;
          }
        }
      }
      const credit = this.credit;
      const onLabelChange = function() {
        credit.off("labelChange", onLabelChange);
        console.log('Web2Cit: Adding "Web2Cit" to credit label...');
        credit.setLabel($(
          `<div>${credit.label} & <a href="https://web2cit.toolforge.org/${url}" target="_blank">Web2Cit (🖉)</a></div>`
        ));
      }
      if (web2cit) {
        credit.on("labelChange", onLabelChange);  
      }
      return buildTemplateResults.bind(this)(searchResults);
    }
  }

  unpatchAjax() {
    if (!this.unpatched.ajax) return;
    // console.log("Web2Cit: Unpatching ajax...");
    $.ajax = this.unpatched.ajax;
    delete this.unpatched.ajax;
  }

  unpatchBuildTemplateResults() {
    if (!this.unpatched.buildTemplateResults) return;
    // console.log("Web2Cit: Unpatching CitoidInspector's \"buildTemplateResults\"...");
    ve.ui.CitoidInspector.prototype.buildTemplateResults = this.unpatched.buildTemplateResults;
    delete this.unpatched.buildTemplateResults;
  }
}

// a "gadget loader" - a small gadget that tells VE to load the real gadget
// once VE is activated by the user
// https://www.mediawiki.org/wiki/VisualEditor/Gadgets#Deployment
mw.loader.using( 'ext.visualEditor.desktopArticleTarget.init', function () {
  // console.log("Web2Cit script will load...");
  // return mw.loader.getScript('/w/index.php?title=User:Diegodlh/Web2Cit/script.js&action=raw&ctype=text/javascript'); 
  window.web2cit = new Web2Cit();
  mw.hook( 've.activationComplete' ).add( function () {
    // console.log('Web2Cit: Running "ve.activationComplete" hook...')
    window.web2cit.init();
  });
  // mw.hook( 've.wikitextInteractive' ).add( function () {
  //   console.log('Web2Cit: Running "ve.wikitextInteractive" hook...')
  //   window.web2cit.init();
  // } );
});
