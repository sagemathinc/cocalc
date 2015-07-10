render = (flux) ->
    store = project_store.getStore(project_id, flux)
    # the store provides a current_path prop
    <FluxComponent flux={flux} connectToStores={[store.name]}>
        <MiniTerminal project_id={project_id} />
    </FluxComponent>


exports.render_miniterm = (project_id, dom_node, flux) ->
    React.render(render(project_id, flux), dom_node)