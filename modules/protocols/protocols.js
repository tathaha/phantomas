/**
 * Domains monitor
 */
"use strict";

module.exports = function (phantomas) {
  var domains = new Map(),
    beforeDomReady = true;

  phantomas.setMetric("mainDomainHttpProtocol"); // @desc HTTP protocol used by the main domain (string)
  phantomas.setMetric("oldHttpProtocol"); // @desc number of domains using HTTP/1.0 or 1.1
  phantomas.setMetric("mainDomainTlsProtocol"); // @desc TLS protocol used by the main domain (string)
  phantomas.setMetric("oldTlsProtocol"); // @desc number of domains using TLS 1.1 or 1.2

  // spy all requests
  phantomas.on("recv", (entry) => {
    if (entry.domain) {
      var domain = (entry.isSSL ? "https://" : "http://") + entry.domain;

      if (domains.size === 0) {
        // our first request represents the main domain
        phantomas.setMetric("mainDomainHttpProtocol", entry.httpVersion);
        phantomas.setMetric("mainDomainTlsProtocol", entry.tlsVersion);
      }

      if (!domains.has(domain)) {
        phantomas.log(
          "New domain %s uses HTTP version %s and TLS version %s",
          domain,
          entry.httpVersion,
          entry.tlsVersion
        );

        // add the new domain to the Map
        domains.set(domain, {
          requests: 1,
          httpVersion: entry.httpVersion,
          tlsVersion: entry.tlsVersion,
          beforeDomReady: beforeDomReady,
        });
      } else {
        // just increment the number of requests
        domains.get(domain).requests++;
      }
    }
  });

  // listen to DOM Ready
  phantomas.on("milestone", (name) => {
    if (name === "domReady") {
      beforeDomReady = false;
    }
  });

  // set metrics
  phantomas.on("report", () => {
    domains.forEach(function (value, key) {
      // As of 2020, h2 is the latest protocol, h3 is coming
      if (value.httpVersion.indexOf("http/1") === 0) {
        phantomas.incrMetric("oldHttpProtocol");
        phantomas.addOffender("oldHttpProtocol", {
          domain: key,
          httpVersion: value.httpVersion,
          requests: value.requests, // the more requests, the more h2 is important
        });
      }

      // As of 2020, TLS 1.3 is the latest protocol and it brings speed improvements over 1.2
      if (value.tlsVersion) {
        // parse version number
        var tlsVersion = parseFloat(value.tlsVersion.substring(4));

        if (tlsVersion < 1.3) {
          phantomas.incrMetric("oldTlsProtocol");
          phantomas.addOffender("oldTlsProtocol", {
            domain: key,
            tlsVersion: value.tlsVersion,
            beforeDomReady: value.beforeDomReady, // identifies the most critical domains
          });
        }
      }
    });
  });
};
