/*
  *
  * Licensed to the Apache Software Foundation (ASF) under one
  * or more contributor license agreements. See the NOTICE file
  * distributed with this work for additional information
  * regarding copyright ownership. The ASF licenses this file
  * to you under the Apache License, Version 2.0 (the
  * "License"); you may not use this file except in compliance
  * with the License. You may obtain a copy of the License at
  *
  * http://www.apache.org/licenses/LICENSE-2.0
  *
  * Unless required by applicable law or agreed to in writing,
  * software distributed under the License is distributed on an
  * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
  * KIND, either express or implied. See the License for the
  * specific language governing permissions and limitations
  * under the License.
  *
  */;
var AppRate, Locales, localeObj, exec, Storage;

Locales = require('./locales');

exec = require('cordova/exec');

Storage = require('./storage')

AppRate = (function() {
  var FLAG_NATIVE_CODE_SUPPORTED, LOCAL_STORAGE_COUNTER, PREF_STORE_URL_FORMAT_IOS, counter, getAppTitle, getAppVersion, promptForRatingWindowButtonClickHandler, showDialog, updateCounter;

  function AppRate() {}

  LOCAL_STORAGE_COUNTER = 'counter';
  LOCAL_STORAGE_IOS_RATING = 'iosRating';

  FLAG_NATIVE_CODE_SUPPORTED = /(iPhone|iPod|iPad|Android)/i.test(navigator.userAgent.toLowerCase());

  PREF_STORE_URL_PREFIX_IOS9 = "itms-apps://itunes.apple.com/app/viewContentsUserReviews/id";
  PREF_STORE_URL_POSTFIX_IOS9 = "?action=write-review";
  PREF_STORE_URL_FORMAT_IOS8 = "http://itunes.apple.com/WebObjects/MZStore.woa/wa/viewContentsUserReviews?pageNumber=0&sortOrdering=1&type=Purple+Software&mt=8&id=";

  counter = {
    applicationVersion: void 0,
    countdown: 0
  };

  var iOSRating = {
    timesPrompted: 0,
    lastPromptDate: null
  };

  updateCounter = function(action) {
    if (action == null) {
      action = 'increment';
    }
    switch (action) {
      case 'increment':
        if (counter.countdown <= AppRate.preferences.usesUntilPrompt) {
          counter.countdown++;
        }
        break;
      case 'reset':
        counter.countdown = 0;
        break;
      case 'stop':
        counter.countdown = AppRate.preferences.usesUntilPrompt + 1;
    }
    Storage.set(LOCAL_STORAGE_COUNTER, counter);
    return counter;
  };

  updateiOSRatingData = function() {
    if (checkIfDateIsAfter(iOSRating.lastPromptDate, 365)) {
      iOSRating.timesPrompted = 0;
    }

    iOSRating.timesPrompted++;
    iOSRating.lastPromptDate = new Date();

    Storage.set(LOCAL_STORAGE_IOS_RATING, iOSRating);
  };

  showDialog = function(immediately) {
    updateCounter();
    if (counter.countdown === AppRate.preferences.usesUntilPrompt || immediately) {
      var base = AppRate.preferences.callbacks;
      updateCounter('reset');
      if (typeof base.onRateDialogShow === "function") {
        base.onRateDialogShow();
      }
    }
    return AppRate;
  };

  getAppVersion = function(successCallback, errorCallback) {
    if (FLAG_NATIVE_CODE_SUPPORTED) {
      exec(successCallback, errorCallback, 'AppRate', 'getAppVersion', []);
    } else {
      successCallback(counter.applicationVersion);
    }
    return AppRate;
  };

  getAppTitle = function(successCallback, errorCallback) {
    if (FLAG_NATIVE_CODE_SUPPORTED) {
      exec(successCallback, errorCallback, 'AppRate', 'getAppTitle', []);
    } else {
      successCallback(AppRate.preferences.displayAppName);
    }
    return AppRate;
  };

  AppRate.init = function() {
    AppRate.ready = Promise.all([
      Storage.get(LOCAL_STORAGE_COUNTER).then(function (storedCounter) {
        counter = storedCounter || counter
      }),
      Storage.get(LOCAL_STORAGE_IOS_RATING).then(function (storedRating) {
        iOSRating = storedRating || iOSRating

        if (iOSRating.lastPromptDate) {
          iOSRating.lastPromptDate = new Date(iOSRating.lastPromptDate);
        }
      })
    ])

    getAppVersion((function(_this) {
      return function(applicationVersion) {
        if (counter.applicationVersion !== applicationVersion) {
          counter.applicationVersion = applicationVersion;
          if (_this.preferences.promptAgainForEachNewVersion) {
            updateCounter('reset');
          }
        }
        return _this;
      };
    })(this));
    getAppTitle((function(_this) {
      return function(displayAppName) {
        _this.preferences.displayAppName = displayAppName;
        return _this;
      };
    })(this));
    return this;
  };

  AppRate.locales = Locales;

  AppRate.preferences = {
    useLanguage: null,
    displayAppName: '',
    simpleMode: false,
    promptAgainForEachNewVersion: true,
    usesUntilPrompt: 3,
    inAppReview: true,
    callbacks: {
      onButtonClicked: null,
      onRateDialogShow: null,
      handleNegativeFeedback: null,
      done: null
    },
    storeAppURL: {
      ios: null,
      android: null,
      blackberry: null,
      windows8: null,
      windows: null
    },
    customLocale: null
  };

  AppRate.promptForRating = function(immediately) {
    AppRate.ready.then(function() {
      if (immediately == null) {
        immediately = true;
      }

      // see also: https://cordova.apache.org/news/2017/11/20/migrate-from-cordova-globalization-plugin.html
      if (AppRate.preferences.useLanguage === null && window.Intl && typeof window.Intl === 'object') {
        AppRate.preferences.useLanguage = window.navigator.language;
      }

      showDialog(immediately);
    });
    return this;
  };

  AppRate.navigateToAppStore = function() {
    var iOSVersion;
    var iOSStoreUrl;

    if (/(iPhone|iPod|iPad)/i.test(navigator.userAgent.toLowerCase())) {
      if (this.preferences.inAppReview) {
        updateiOSRatingData();
        var showNativePrompt = iOSRating.timesPrompted < 3;
        exec(null, null, 'AppRate', 'launchiOSReview', [this.preferences.storeAppURL.ios, showNativePrompt]);
      } else {
        iOSVersion = navigator.userAgent.match(/OS\s+([\d\_]+)/i)[0].replace(/_/g, '.').replace('OS ', '').split('.');
        iOSVersion = parseInt(iOSVersion[0]) + (parseInt(iOSVersion[1]) || 0) / 10;
        if (iOSVersion < 9) {
          iOSStoreUrl = PREF_STORE_URL_FORMAT_IOS8 + this.preferences.storeAppURL.ios;
        } else {
          iOSStoreUrl = PREF_STORE_URL_PREFIX_IOS9 + this.preferences.storeAppURL.ios + PREF_STORE_URL_POSTFIX_IOS9;
        }
        cordova.InAppBrowser.open(iOSStoreUrl, '_system', 'location=no');
      }
    } else if (/(Android)/i.test(navigator.userAgent.toLowerCase())) {
      cordova.InAppBrowser.open(this.preferences.storeAppURL.android, '_system', 'location=no');
    } else if (/(Windows|Edge)/i.test(navigator.userAgent.toLowerCase())) {
      cordova.InAppBrowser.open(this.preferences.storeAppURL.windows, '_blank', 'location=no');
    } else if (/(BlackBerry)/i.test(navigator.userAgent.toLowerCase())) {
      cordova.InAppBrowser.open(this.preferences.storeAppURL.blackberry, '_system', 'location=no');
    } else if (/(IEMobile|Windows Phone)/i.test(navigator.userAgent.toLowerCase())) {
      cordova.InAppBrowser.open(this.preferences.storeAppURL.windows8, '_system', 'location=no');
    }
    return this;
  };

  return AppRate;

})();

AppRate.init();

function checkIfDateIsAfter(date, minimumDifference) {
  if (!date) {
    return false;
  }

  const dateTimestamp = date.getTime();
  const todayTimestamp = new Date().getTime();
  const differenceInDays = Math.abs((todayTimestamp - dateTimestamp) / (3600 * 24 * 1000));

  return differenceInDays > minimumDifference;
}

module.exports = AppRate;
