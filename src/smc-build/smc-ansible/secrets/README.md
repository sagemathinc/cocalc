Hey, did you really think we post our secret private keys to github?
This public repository doesn't contain the private keys
or any other very specific account configurations.

For submitting custom metrics: 

add a `creds.dat` file containing your authentication for the google api for custom metrics. 



For SSH: what this directory here should contain are two files:

* gce.ini with this content:

```
#!/usr/bin/python
gce_service_account_email_address = '{{ GCE service account  }}@developer.gserviceaccount.com'
gce_service_account_pem_file_path = '{{ converted-p12 }}.pem'
gce_project_id = '{{ your project id }}'
```

* the referenced `{{ converted from p12}}.pem` file, see `README.md`


