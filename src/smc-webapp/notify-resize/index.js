/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.NotifyResize = undefined;

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _react = require('react');

var _react2 = _interopRequireDefault(_react);

var _propTypes = require('prop-types');

var _shallowequal = require('shallowequal');

var _shallowequal2 = _interopRequireDefault(_shallowequal);

var _autoBind = require('@zippytech/react-class/autoBind');

var _autoBind2 = _interopRequireDefault(_autoBind);

var _uglified = require('@zippytech/uglified');

var _uglified2 = _interopRequireDefault(_uglified);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; } /**
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                * Copyright 2015-present Zippy Technologies
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                *
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                * Licensed under the Apache License, Version 2.0 (the "License");
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                * you may not use this file except in compliance with the License.
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                * You may obtain a copy of the License at

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                *   http://www.apache.org/licenses/LICENSE-2.0

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                * Unless required by applicable law or agreed to in writing, software
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                * distributed under the License is distributed on an "AS IS" BASIS,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                * See the License for the specific language governing permissions and
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                * limitations under the License.
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                */

var showWarnings = !_uglified2.default;

var notifyResizeStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  zIndex: -1,
  overflow: 'hidden',
  display: 'block',
  pointerEvents: 'none',
  opacity: 0,
  direction: 'ltr',
  textAlign: 'start'
};

var expandToolStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  overflow: 'auto'
};

var contractToolStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  overflow: 'auto'
};

var contractToolInnerStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '200%',
  height: '200%'
};

var ZippyNotifyResize = function (_React$Component) {
  _inherits(ZippyNotifyResize, _React$Component);

  function ZippyNotifyResize(props) {
    _classCallCheck(this, ZippyNotifyResize);

    var _this = _possibleConstructorReturn(this, (ZippyNotifyResize.__proto__ || Object.getPrototypeOf(ZippyNotifyResize)).call(this, props));

    (0, _autoBind2.default)(_this);

    _this.state = {
      notifyResizeWidth: 0,
      notifyResizeHeight: 0,

      expandToolWidth: 0,
      expandToolHeight: 0,

      contractToolWidth: 0,
      contractToolHeight: 0
    };
    return _this;
  }

  _createClass(ZippyNotifyResize, [{
    key: 'shouldComponentUpdate',
    value: function shouldComponentUpdate(nextProps, nextState) {
      if (typeof nextProps.shouldComponentUpdate === 'function') {
        return nextProps.shouldComponentUpdate(nextProps, this.props, nextState, this.state);
      }

      return !(0, _shallowequal2.default)(nextState, this.state) || !(0, _shallowequal2.default)(nextProps, this.props);
    }
  }, {
    key: 'componentDidMount',
    value: function componentDidMount() {
      if (typeof this.props.onMount === 'function') {
        this.props.onMount(this);
      }

      this.resetResizeTool();

      if (this.props.notifyOnMount) {
        var _notifyResizeSize = this.notifyResizeSize,
            width = _notifyResizeSize.notifyResizeWidth,
            height = _notifyResizeSize.notifyResizeHeight;

        this.onResize({ width: width, height: height });
      }
    }
  }, {
    key: 'render',
    value: function render() {
      return _react2.default.createElement(
        'div',
        {
          ref: 'notifyResize',
          style: notifyResizeStyle,
          onScroll: this.checkResize
        },
        this.renderExpandTool(),
        this.renderContractTool()
      );
    }
  }, {
    key: 'renderExpandTool',
    value: function renderExpandTool() {
      return _react2.default.createElement(
        'div',
        { ref: 'expandTool', style: expandToolStyle },
        _react2.default.createElement('div', {
          ref: 'expandToolInner',
          style: {
            position: 'absolute',
            top: 0,
            left: 0,
            width: this.state.expandToolWidth,
            height: this.state.expandToolHeight
          }
        })
      );
    }
  }, {
    key: 'renderContractTool',
    value: function renderContractTool() {
      return _react2.default.createElement(
        'div',
        {
          ref: 'contractTool',
          style: contractToolStyle,
          onScroll: this.checkResize
        },
        _react2.default.createElement('div', { ref: 'contractInner', style: contractToolInnerStyle })
      );
    }
  }, {
    key: 'resetResizeTool',
    value: function resetResizeTool() {
      this.setDimensions();
      this.scrollToBottomExpandTool();
    }
  }, {
    key: 'setDimensions',
    value: function setDimensions() {
      var _notifyResizeSize2 = this.notifyResizeSize = this.getDimensions(),
          notifyResizeWidth = _notifyResizeSize2.notifyResizeWidth,
          notifyResizeHeight = _notifyResizeSize2.notifyResizeHeight;

      // Resize tool will be bigger than it's parent by 1 pixel in each direction


      this.setState({
        notifyResizeWidth: notifyResizeWidth,
        notifyResizeHeight: notifyResizeHeight,
        expandToolWidth: notifyResizeWidth + 1,
        expandToolHeight: notifyResizeHeight + 1
      });
    }
  }, {
    key: 'getDimensions',
    value: function getDimensions() {
      var notifyResize = this.refs.notifyResize;
      var node = notifyResize.parentElement || notifyResize;

      var size = void 0;

      if (typeof this.props.measureSize == 'function') {
        size = this.props.measureSize(node, notifyResize);
      } else {
        size = {
          width: node.offsetWidth,
          height: node.offsetHeight
        };
      }

      return {
        notifyResizeWidth: size.width,
        notifyResizeHeight: size.height
      };
    }
  }, {
    key: 'scrollToBottomExpandTool',
    value: function scrollToBottomExpandTool() {
      var _this2 = this;

      // so the scroll moves when element resizes
      if (this.refs.notifyResize) {
        setTimeout(function () {
          // scroll to bottom
          var expandTool = _this2.refs.expandTool;

          if (expandTool) {
            expandTool.scrollTop = expandTool.scrollHeight;
            expandTool.scrollLeft = expandTool.scrollWidth;
          }

          var contractTool = _this2.refs.contractTool;
          if (contractTool) {
            contractTool.scrollTop = contractTool.scrollHeight;
            contractTool.scrollLeft = contractTool.scrollWidth;
          }
        }, 0);
      }
    }
  }, {
    key: 'checkResize',
    value: function checkResize() {
      var _getDimensions = this.getDimensions(),
          notifyResizeWidth = _getDimensions.notifyResizeWidth,
          notifyResizeHeight = _getDimensions.notifyResizeHeight;

      if (notifyResizeWidth !== this.state.notifyResizeWidth || notifyResizeHeight !== this.state.notifyResizeHeight) {
        // reset resizeToolDimensions
        this.onResize({
          width: notifyResizeWidth,
          height: notifyResizeHeight
        });
        this.resetResizeTool();
      }
    }
  }, {
    key: 'onResize',
    value: function onResize(_ref) {
      var width = _ref.width,
          height = _ref.height;

      if (typeof this.props.onResize === 'function') {
        this.props.onResize({ width: width, height: height });
      }
    }
  }]);

  return ZippyNotifyResize;
}(_react2.default.Component);

ZippyNotifyResize.propTypes = {
  onResize: _propTypes.func,
  onMount: _propTypes.func,
  notifyOnMount: _propTypes.bool
};

var notifyResize = function notifyResize(Cmp) {
  return function (_React$Component2) {
    _inherits(NotifyResizeWrapper, _React$Component2);

    function NotifyResizeWrapper(props) {
      _classCallCheck(this, NotifyResizeWrapper);

      var _this3 = _possibleConstructorReturn(this, (NotifyResizeWrapper.__proto__ || Object.getPrototypeOf(NotifyResizeWrapper)).call(this, props));

      (0, _autoBind2.default)(_this3);

      _this3.refComponent = function (c) {
        _this3.component = c;
      };
      return _this3;
    }

    _createClass(NotifyResizeWrapper, [{
      key: 'componentDidMount',
      value: function componentDidMount() {
        var component = this.component;

        // check if they are mounted
        if (!this.notifyResize && showWarnings) {
          console.warn('For notifyResize to work you must render resizeTool from {props.resizeTool}');
        }
      }
    }, {
      key: 'onNotifyResizeMount',
      value: function onNotifyResizeMount(notifier) {
        this.notifyResize = notifier;
      }
    }, {
      key: 'onResize',
      value: function onResize() {
        if (typeof this.props.onResize === 'function') {
          var _props;

          (_props = this.props).onResize.apply(_props, arguments);
        }

        if (typeof this.component.onResize === 'function') {
          var _component;

          (_component = this.component).onResize.apply(_component, arguments);
        }
      }
    }, {
      key: 'render',
      value: function render() {
        var resizeTool = _react2.default.createElement(ZippyNotifyResize, {
          onResize: this.onResize,
          onMount: this.onNotifyResizeMount,
          notifyOnMount: this.props.notifyOnMount
        });

        return _react2.default.createElement(Cmp, _extends({ ref: this.refComponent }, this.props, { resizeTool: resizeTool }));
      }
    }]);

    return NotifyResizeWrapper;
  }(_react2.default.Component);
};

exports.default = notifyResize;
exports.NotifyResize = ZippyNotifyResize;