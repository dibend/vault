var fs = require('fs');
var express = require('express');
var http = require('http');
var https = require('https');
var compression = require('compression');
var path = require('path');
var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');
var busboy = require('connect-busboy');
var mkdirp = require('mkdirp');
var rimraf = require('rimraf');
var req = require('request');
var bodyParser = require('body-parser');
var morgan = require('morgan');
var ipfilter = require('express-ipfilter').IpFilter;
var config = require('./config');

var mailer = nodemailer.createTransport(smtpTransport({
    host: config.ses_host,
    secureConnection: true,
    port: 465,
    auth: {
        user: config.ses_user,
        pass: config.ses_pass
    }
}));

var sslKey = fs.readFileSync('letsencrypt/privkey.pem', 'utf8');
var sslCert = fs.readFileSync('letsencrypt/cert.pem', 'utf8');
var ca = [
    fs.readFileSync('letsencrypt/chain.pem', 'utf8'), 
    fs.readFileSync('letsencrypt/fullchain.pem', 'utf8')
]; 

var creds = {
    key: sslKey,
    cert: sslCert,
    ca: ca
};

//Request CSV Columns
console.log('"ip","date","method","url","status","time"');

var app = express();
app.use(busboy());
app.use(compression());
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(bodyParser.urlencoded({extended: true}));
app.use(ipfilter(config.blacklist, {log: false}));
app.use(express.static('public', {extensions: ['html']}));
app.use(morgan('":remote-addr",":date[web]",":method",":url",":status",":response-time ms"'));

app.get('/submit', function(request, response) {
    var applicant = {
        'Business Name': request.query.name, 
        'Business Phone': request.query.phone,
        'Business Fax': request.query.fax,
        'Business Address': request.query.baddress,
        'Business City': request.query.bcity,
        'Business State': request.query.bstate,
        'Business Zip': request.query.bzip,
        'Desired Funding Amount': request.query.funding,
        'Federal I.D. Number': request.query.fedid,
        'Date of Incorporation': request.query.dateinc,
        'Type of Incorporation/Ownership': request.query.typeinc,
        'Type of Business': request.query.typebis,
        'First Owner\'s Full Legal Name': request.query.owner1,
        'First Owner\'s Title': request.query.owner1title,
        'First Owner\'s Ownership Percentage': request.query.owner1perc,
        'First Owner\'s Social Security Number': request.query.owner1ssn,
        'First Owner\'s Home Phone': request.query.owner1homephone,
        'First Owner\'s Cell Phone': request.query.owner1cellphone,
        'First Owner\'s Date of Birth': request.query.owner1dob,
        'First Owner\'s Email': request.query.owner1email,
        'First Owner\'s Home Street Address': request.query.owner1address,
        'First Owner\'s Home City': request.query.owner1city,
        'First Owner\'s Home State': request.query.owner1state,
        'First Owner\'s Home Zip': request.query.owner1zip,
        'Second Owner\'s Full Legal Name': request.query.owner2,
        'Second Owner\'s Title': request.query.owner2title,
        'Second Owner\'s Ownership Percentage': request.query.owner2perc,
        'Second Owner\'s Social Security Number': request.query.owner2ssn,
        'Second Owner\'s Home Phone': request.query.owner2homephone,
        'Second Owner\'s Cell Phone': request.query.owner2cellphone,
        'Second Owner\'s Date of Birth': request.query.owner2dob,
        'Second Owner\'s Email': request.query.owner2email,
        'Second Owner\'s Home Address': request.query.owner2address,
        'Financial Needs': request.query.fineed,
        'Terms of Financing': request.query.term,
        'Purchase Price': request.query.pp,
        'Lender': request.query.lender,
        'Lender\'s Phone': request.query.lphone,
        'Lender Contact': request.query.lcontact,
        'Owner/Officer Bankruptcy in Last 5 Years': request.query.bankruptcy
    }
    var filled = 0;
    var emailText = '';
    for(dp in applicant) {
        if(applicant[dp]) {
            emailText += dp + ':\n' + applicant[dp] + '\n\n';
            filled++;
        }
    }
    if(filled < 3) {
        response.redirect('/apply.html');
        return;
    }

    var mailOptions = {
        from: config.from,
        to: config.to,
        subject: 'Fundrite Application',
        text: emailText,
    };
    if(request.query.name) {
        mailOptions.subject = request.query.name + ' Application';
    }

    var attachments = [];
    var upPath = './uploads/' + request.ip + '/';

    if(fs.existsSync(upPath)) {
        fs.readdir(upPath, function(err, files) {
            files.forEach(function(file) {
                var attachment = {
                    filename: file,
                    path: upPath + file
                };
                attachments.push(attachment);
            });

            mailOptions.attachments = attachments;
            mailer.sendMail(mailOptions, function(err, res) {
                if(err) {
                    console.error(err);
                }
                mailer.close();
                rimraf(upPath, function() {
                    console.error(upPath + ' deleted');
                });
            });
        });
    } else {
        mailer.sendMail(mailOptions, function(err, res) {
            if(err) {
                console.error(err);
            }
            mailer.close();
        });
    }

    var first;
    var last;
    if(request.query.owner1 !== null) {
        var nameAr = request.query.owner1.split(' ');
        first = nameAr[0];
        last = nameAr[nameAr.length-1];
    }

    var ibvOptions = {
        method: 'POST',
        url: config.ibv_url,
        qs: {
            MemberId: config.ibv_id,
            MemberPwd: config.ibv_pass,
            CallbackUrl: config.ibv_callback_url,
            ContactBy: 'BOTH',
            'Customer.CompletionEmail': request.query.owner1email,
            'Customer.LegalCorporateName': request.query.name,
            'Customer.WorkPhone': request.query.phone,
            'Customer.FederalTaxId': request.query.fedid,
            'Customer.DateBusinessStarted': request.query.dateinc,
            'Customer.TypeOfEntity': request.query.typeinc,
            'Customer.ContactFirstName': first,
            'Customer.ContactLastName': last,
            'Customer.ContactTitle': request.query.owner1title,
            'Customer.ContactOwnershipPercentage': request.query.owner1perc,
            'Customer.ContactWorkEmail': request.query.owner1email,
            'Customer.ContactSSN': request.query.owner1ssn,
            'Customer.ContactDOB': request.query.owner1dob,
            'Customer.ContactHomePhone': request.query.owner1homephone,
            'Customer.ContactCellPhone': request.query.owner1cellphone,
            'Customer.NoPartner': 'true',
            'Customer.PhysicalAddress': request.query.baddress,
            'Customer.City': request.query.bcity,
            'Customer.State': request.query.bstate,
            'Customer.Zip': request.query.bzip,
            'Customer.ContactHomeAddress': request.query.owner1address,
            'Customer.ContactCity': request.query.owner1city,
            'Customer.ContactState': request.query.owner1state,
            'Customer.ContactZIP': request.query.owner1zip
        },
        headers: { 
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'application/json' 
        }
    };
    req(ibvOptions, function (error, response, body) {
        if(error) {
            console.error(error);
        }
    });

    if(first && last && request.query.owner1address && request.query.owner1city && request.query.owner1state && request.query.owner1zip && request.query.owner1ssn) {
        var experianXml =`<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:mes="http://schema.microbilt.com/messages/" xmlns:glob="http://schema.microbilt.com/globals">
        <soapenv:Header/>
         <soapenv:Body>
          <mes:GetReport>
             <mes:inquiry>
                <MsgRqHdr xmlns="http://schema.microbilt.com/globals">
                   <MemberId>` + config.experian_id + `</MemberId>
                   <MemberPwd>` + config.experian_pass + `</MemberPwd>
                </MsgRqHdr>
                <PersonInfo xmlns="http://schema.microbilt.com/globals">
                   <PersonName>
                      <FirstName>` + first + `</FirstName>
                      <LastName>` + last + `</LastName>
                   </PersonName>
                   <ContactInfo>
                      <PostAddr>
                         <Addr1>` + request.query.owner1address + `</Addr1>
                         <City>` + request.query.owner1city + `</City>
                         <StateProv>` + request.query.owner1state + `</StateProv>
                         <PostalCode>` + request.query.owner1zip + `</PostalCode>
                         <Country>USA</Country>
                      </PostAddr>
                   </ContactInfo>
                   <TINInfo>
                      <TINType>SSN</TINType>
                      <TaxId>` + request.query.owner1ssn + `</TaxId>
                   </TINInfo>
                </PersonInfo>
             </mes:inquiry>
           </mes:GetReport>
         </soapenv:Body>
        </soapenv:Envelope>`;
        req.post({
            url: config.experian_url,
            body: experianXml,
            headers: {
                'Content-Type': 'text/xml',
                SOAPAction: 'http://schema.microbilt.com/messages/GetReport'
            }
        }, function(error, response, body) {
            var mailOptions = {
                from: config.from,
                to: config.to,
                subject: first + ' ' + last + ' Credit Report',
                text: 'https://creditserver.microbilt.com/WebServices/gethtml/gethtml.aspx?guid=' + body.match(new RegExp('\<RqUID\>(.*)\<\/RqUID\>'))[1]
            };
            mailer.sendMail(mailOptions, function(err, res) {
                if(err) {
                    console.error(err);
                    console.error(mailOptions);
                }
                mailer.close();
            });
        });
    }

    var mcaOptions = {
        url: config.mca_url,
        method: 'POST',
        headers: {
            X_MCASUITE_APP_ID: config.mca_id,
            X_MCASUITE_APP_TOKEN: config.mca_pass
        },
        form: {
            firstName: first,
            lastName: last,
            companyBusinessPhone: request.query.phone,
            companyFaxPhone: request.query.fax, 
            ownerEmail: request.query.owner1email,
            companyName: request.query.name,
            dba: request.query.name,
            title: request.query.owner1title,
            ssn: request.query.owner1ssn,
            dateOfBirth: request.query.owner1dob,
            ownerHomePhone: request.query.owner1homephone,
            ownerMobilePhone: request.query.owner1cellphone,
            ownership: request.query.owner1perc 
        }
    };
    if(mcaOptions.form.firstName === '' || mcaOptions.form.firstName == null) {
        mcaOptions.form.firstName = 'N/A';
    }
    if(mcaOptions.form.lastName === '' || mcaOptions.form.lastName == null) {
        mcaOptions.form.lastName = 'N/A';
    }
    req(mcaOptions, function (error, response, body) {
        if(error) {
            console.error(error);
        }
    });
    response.redirect('/app_sent.html');
});

app.get('/contact', function(request, response) {
    if(request.query['g-recaptcha-response'] === '' || request.query['g-recaptcha-response'] == null) {
        response.redirect('/#contact');
        return;
    }

    var mailOptions = {
      from: config.from,
      to: config.to,
      subject: 'New Fundrite Lead',
      text: 'Name:\n' + request.query.name +
            '\n\nEmail:\n' + request.query.email +
            '\n\nPhone:\n' + request.query.phone +
            '\n\nMessage:\n' + request.query.message
    };

    mailer.sendMail(mailOptions, function(err, res) {
      if(err) {
        console.error(err);
      }
      mailer.close();
    });
    response.redirect('/message_sent.html');
});

app.post('/up', function(request, response) {
    request.pipe(request.busboy);
    request.busboy.on('file', function(fieldname, file, filename) {
        var upPath = './uploads/' + request.ip + '/';
        mkdirp(upPath, function (err) {
            if (err) {
                console.error(err);
            } else {
                var fstream = fs.createWriteStream(upPath + filename);
                file.pipe(fstream);
                console.error(upPath + filename + ' uploaded');
            }
        });
    });
    response.send('uploaded');
});

app.post('/ibv', function(request, response) {
    var mailOptions = {
        from: config.from,
        to: config.to,
        subject: 'New Fundrite Applicant Bank Statements',
        text: config.ibv_report_url + request.body.Reference,
    };
    mailer.sendMail(mailOptions, function(err, res) {
      if(err) {
        console.error(err);
        console.error(mailOptions);
      }
      mailer.close();
    });
    response.send(request.body);
});

app.get('*', function(request, response) {
    response.status(404);
    response.sendFile(path.join(__dirname+'/public/404.html'));
});

http.createServer(function (request, response) {
    response.writeHead(301, { 'Location': 'https://' + request.headers['host'] + request.url });
    response.end();
}).listen(8080);

https.createServer(creds, app).listen(8443);
