import React, { Component } from 'react';
import { Device } from 'twilio-client';

export default class App extends Component {
  constructor(props) {
    super(props);

    this.state = {};

    Device.ready(() => {
      this.setState({ success: true });
    });
    
    Device.setup(props.token)
  }

  render() {
    if (this.state.success) {
      return <p>Setup successful</p>;
    }
    return <p>Calling Device.setup</p>;
  }
}
