#!/bin/bash

# Redirect port 80 (http) to 8080 (http server)
# Redirect port 443 (https) to 8443 (https server)
# Allows express server to be run as regular user for security measures

sudo iptables -t nat -D PREROUTING 1
sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-ports 8080
sudo iptables -t nat -A PREROUTING -p tcp --dport 443 -j REDIRECT --to-ports 8443

nohup node server.js 2> fundrite.log 1> requests.csv &
