# https://cloud.google.com/compute/pricing

# all storage prices are per GB per month.
PRICING = {
    'gcs-standard'     : 0.026,
    'gcs-reduced'      : 0.02,
    'gcs-nearline'     : 0.01,
    'snapshot'         : 0.026,
    'local-ssd'        : 0.218,
    'pd-ssd'           : 0.17,
    'pd-standard'      : 0.04,

    'n1-standard-hour' : 0.05,          # for equivalent of -1, so multiply by number of cpu's (the suffix)
    'n1-standard-hour-pre'  : 0.01,
    'n1-standard-month': 0.035*30.5*24,  # price for sustained use for a month
    'n1-standard-ram'  : 3.75,           # amount in GB of base machine

    'n1-highmem-hour'  : 0.096/2,
    'n1-highmem-hour-pre'   : 0.025/2,
    'n1-highmem-month' : 0.088*30.5*24/2,
    'n1-highmem-ram'   : 6.5,

    'n1-highcpu-hour'  : 0.076/2,
    'n1-highcpu-hour-pre'   : 0.015/2,
    'n1-highcpu-month' : 0.053*30.5*24/2,
    'n1-highcpu-ram'   : 0.9,

    'g1-small-hour'    : 0.021,
    'g1-small-hour-pre': 0.007,
    'g1-small-month'   : 0.019*30.5*24,
    'g1-small-ram'     : 1.7,

    'f1-micro-hour'    : 0.008,
    'f1-micro-hour-pre': 0.0035,
    'f1-micro-month'   : 0.0056*30.5*24,
    'f1-micro-ram'     : 0.60,

    'europe'           : 1.096,
    'asia'             : 1.096,
    'us'               : 1,

    'egress'           : 0.12,
    'egress-china'     : 0.23,
    'egress-australia' : 0.19,
}

def cpu_cost(size='n1-standard-1', preemptible=False, region='us'):
    if size.count('-') == 2:
        i = size.rfind('-')
        m = int(size[i+1:])
    else:
        i = len(size)
        m = 1
    if preemptible:
        x = PRICING[size[:i] + '-hour-pre']*24*30.5*m
        return [x, x]
    else:
        return [m*PRICING[size[:i] + '-month'], m*PRICING[size[:i] + '-hour']*24*30.5]

def disk_cost(disk_size=10, disk_type='pd-standard'):
    x = PRICING[disk_type] * disk_size
    return [x, x]

import locale
locale.setlocale( locale.LC_ALL, '' )
def money(s):
    return locale.currency(s)


