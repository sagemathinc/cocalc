import jupyter_client


def test_start_new_kernel(kname):
    """launch jupyter kernel using same interface as sagews jupyter bridge"""
    try:
        km, kc = jupyter_client.manager.start_new_kernel(
            kernel_name=kname, startup_timeout=10)
        assert km is not None
        assert kc is not None
        print("kernel {} started successfully".format(kname))
        km.shutdown_kernel()
    except:
        assert 0, "kernel {} failed to start".format(kname)
